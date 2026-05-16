// Clash Demon King NFT module on Aptos (Move) — V3-feature-parity mirror
// of DemonKingBaseV3 on Base/Arbitrum/Monad.
//
// Architecture:
//   - `initialize` creates a resource account that owns the parent
//     Collection. The resource account's SignerCapability is stored in
//     Config so `mint_with_quote`, `upgrade_with_quote`, and `bridge_burn`
//     can sign on its behalf.
//   - Each minted token carries a `level` property in its PropertyMap
//     (1, 2, or 3). Default at mint is 1.
//   - All paid operations require a server-signed ed25519 quote whose
//     nonce is recorded in `Config.used_nonces` for replay protection.
//   - `bridge_burn` deletes the token and emits a BridgeBurnEvent that the
//     server indexes; a matching `bridgeMint` on Base then re-mints at
//     the same level.
//
// Server-authoritative supply cap: the off-chain server enforces
// NFT_GLOBAL_SUPPLY_CAP before signing. The contract additionally
// enforces a per-collection ceiling in Config.max_supply.

module clash_nft::demon_king {
    use std::error;
    use std::option;
    use std::signer;
    use std::string::{Self, String};
    use std::vector;

    use aptos_framework::account::{Self, SignerCapability};
    use aptos_framework::aptos_account;
    use aptos_framework::ed25519;
    use aptos_framework::event;
    use aptos_framework::object::{Self};
    use aptos_framework::primary_fungible_store;
    use aptos_framework::fungible_asset::Metadata;
    use aptos_framework::timestamp;

    use aptos_token_objects::collection;
    use aptos_token_objects::property_map;
    use aptos_token_objects::token::{Self, Token};

    // ─── Errors ────────────────────────────────────────────────────

    const E_NOT_ADMIN: u64 = 1;
    const E_SOLD_OUT: u64 = 2;
    const E_SALE_INACTIVE: u64 = 3;
    const E_BAD_QUANTITY: u64 = 4;
    const E_QUOTE_EXPIRED: u64 = 5;
    const E_QUOTE_USED: u64 = 6;
    const E_BAD_SIGNATURE: u64 = 7;
    const E_UNDER_PAID: u64 = 8;
    const E_NOT_INITIALIZED: u64 = 9;
    const E_NOT_OWNER: u64 = 10;
    const E_BAD_LEVEL: u64 = 11;
    const E_MAX_LEVEL: u64 = 12;
    const E_NO_LEVEL_PROP: u64 = 13;
    const E_BAD_PAYMENT: u64 = 14;

    // ─── Constants ─────────────────────────────────────────────────

    const MAX_LEVEL: u8 = 3;
    const LEVEL_KEY: vector<u8> = b"level";
    const RESOURCE_SEED: vector<u8> = b"clash_demon_king::collection";

    // ─── Resources ─────────────────────────────────────────────────

    /// Shared module config — stored under the publisher address (@clash_nft).
    struct Config has key {
        // Display
        collection_name: String,
        token_uri_base: String,

        // Sale parameters (mint)
        max_supply: u64,
        max_per_tx: u64,
        usd_price_e6: u64,
        sale_active: bool,

        // Upgrade parameters
        upgrade_usd_price_e6: u64,

        // Payment routing
        treasury: address,
        usdc_metadata: address,   // FA address of USDC (Circle native on Aptos)

        // Quote signer (off-chain server's ed25519 public key, 32 bytes)
        quote_signer_pubkey: vector<u8>,

        // Replay protection
        used_nonces: vector<vector<u8>>,

        // Stats
        total_minted: u64,

        // Resource-account signer (owns the collection, used to mint tokens)
        signer_cap: SignerCapability,
        resource_addr: address,
        collection_addr: address,

        // Mint counter (1-indexed for human-friendly token names)
        next_token_index: u64,

        // Events
        minted_events: event::EventHandle<MintedEvent>,
        upgraded_events: event::EventHandle<LevelUpgradedEvent>,
        burned_events: event::EventHandle<BridgeBurnEvent>,
    }

    struct BridgeFeeConfig has key {
        fee_octas: u64,
    }

    struct MintedEvent has drop, store {
        buyer: address,
        token_address: address,
        token_index: u64,
        usd_amount_paid: u64,
        nonce: vector<u8>,
    }

    struct LevelUpgradedEvent has drop, store {
        owner: address,
        token_address: address,
        old_level: u8,
        new_level: u8,
        usd_amount_paid: u64,
        nonce: vector<u8>,
    }

    struct BridgeBurnEvent has drop, store {
        owner: address,
        token_address: address,
        level: u8,
        destination_chain_id: u64,
        token_index: u64,
    }

    /// Per-token refs needed for mutation post-mint. Stored at the token's
    /// own object address so any function with `acquires TokenRefs` can
    /// borrow it given just the token_address.
    struct TokenRefs has key {
        mutator: property_map::MutatorRef,
        token_index: u64,
    }

    // ─── Init ──────────────────────────────────────────────────────

    /// Publish + initialize. Call once from the admin account (@clash_nft).
    public entry fun initialize(
        admin: &signer,
        collection_name: String,
        collection_desc: String,
        collection_uri: String,
        token_uri_base: String,
        max_supply: u64,
        max_per_tx: u64,
        usd_price_e6: u64,
        upgrade_usd_price_e6: u64,
        treasury: address,
        usdc_metadata: address,
        quote_signer_pubkey: vector<u8>,
    ) {
        let admin_addr = signer::address_of(admin);
        assert!(admin_addr == @clash_nft, error::permission_denied(E_NOT_ADMIN));
        assert!(max_supply > 0 && max_per_tx > 0, error::invalid_argument(E_BAD_QUANTITY));
        assert!(vector::length(&quote_signer_pubkey) == 32, error::invalid_argument(E_BAD_SIGNATURE));

        // Create resource account that owns the collection. Its signer is
        // derived from a SignerCapability stored in Config.
        let (resource_signer, signer_cap) = account::create_resource_account(admin, RESOURCE_SEED);
        let resource_addr = signer::address_of(&resource_signer);

        // Parent Collection with a fixed supply cap.
        let collection_ctor = collection::create_fixed_collection(
            &resource_signer,
            collection_desc,
            max_supply,
            collection_name,
            option::none(),
            collection_uri,
        );
        let collection_obj = object::object_from_constructor_ref<collection::Collection>(&collection_ctor);
        let collection_addr = object::object_address(&collection_obj);

        move_to(admin, Config {
            collection_name,
            token_uri_base,
            max_supply,
            max_per_tx,
            usd_price_e6,
            sale_active: false,
            upgrade_usd_price_e6,
            treasury,
            usdc_metadata,
            quote_signer_pubkey,
            used_nonces: vector::empty(),
            total_minted: 0,
            signer_cap,
            resource_addr,
            collection_addr,
            next_token_index: 1,
            minted_events: account::new_event_handle<MintedEvent>(admin),
            upgraded_events: account::new_event_handle<LevelUpgradedEvent>(admin),
            burned_events: account::new_event_handle<BridgeBurnEvent>(admin),
        });
    }

    // ─── Admin functions ───────────────────────────────────────────

    public entry fun set_sale_active(admin: &signer, active: bool) acquires Config {
        assert_admin(admin);
        borrow_global_mut<Config>(@clash_nft).sale_active = active;
    }

    public entry fun set_mint_price(admin: &signer, usd_price_e6: u64) acquires Config {
        assert_admin(admin);
        borrow_global_mut<Config>(@clash_nft).usd_price_e6 = usd_price_e6;
    }

    public entry fun set_upgrade_price(admin: &signer, usd_price_e6: u64) acquires Config {
        assert_admin(admin);
        borrow_global_mut<Config>(@clash_nft).upgrade_usd_price_e6 = usd_price_e6;
    }

    public entry fun set_treasury(admin: &signer, treasury: address) acquires Config {
        assert_admin(admin);
        borrow_global_mut<Config>(@clash_nft).treasury = treasury;
    }

    public entry fun set_quote_signer(admin: &signer, pubkey: vector<u8>) acquires Config {
        assert_admin(admin);
        assert!(vector::length(&pubkey) == 32, error::invalid_argument(E_BAD_SIGNATURE));
        borrow_global_mut<Config>(@clash_nft).quote_signer_pubkey = pubkey;
    }

    public entry fun set_max_supply(admin: &signer, new_max: u64) acquires Config {
        assert_admin(admin);
        let cfg = borrow_global_mut<Config>(@clash_nft);
        assert!(new_max >= cfg.total_minted, error::invalid_argument(E_SOLD_OUT));
        cfg.max_supply = new_max;
    }

    public entry fun init_bridge_fee(admin: &signer, fee_octas: u64) {
        assert_admin(admin);
        if (!exists<BridgeFeeConfig>(@clash_nft)) {
            move_to(admin, BridgeFeeConfig { fee_octas });
        }
    }

    public entry fun set_bridge_fee_octas(admin: &signer, fee_octas: u64) acquires BridgeFeeConfig {
        assert_admin(admin);
        if (!exists<BridgeFeeConfig>(@clash_nft)) {
            move_to(admin, BridgeFeeConfig { fee_octas });
        } else {
            borrow_global_mut<BridgeFeeConfig>(@clash_nft).fee_octas = fee_octas;
        }
    }

    inline fun assert_admin(admin: &signer) {
        assert!(signer::address_of(admin) == @clash_nft, error::permission_denied(E_NOT_ADMIN));
    }

    // ─── Mint ──────────────────────────────────────────────────────

    /// Mint NFTs with a server-signed quote.
    /// Quote message bytes (BCS-friendly canonical encoding):
    ///   buyer_addr ‖ usdc_amount ‖ quantity ‖ nonce ‖ deadline ‖ account_hash
    /// Signed by the server's ed25519 key. Pays USDC (FA) to treasury.
    public entry fun mint_with_quote(
        buyer: &signer,
        usdc_amount: u64,
        quantity: u64,
        nonce: vector<u8>,
        deadline: u64,
        account_hash: vector<u8>,
        signature: vector<u8>,
    ) acquires Config {
        let cfg = borrow_global_mut<Config>(@clash_nft);
        assert!(cfg.sale_active, error::invalid_state(E_SALE_INACTIVE));
        assert!(quantity > 0 && quantity <= cfg.max_per_tx, error::invalid_argument(E_BAD_QUANTITY));
        assert!(cfg.total_minted + quantity <= cfg.max_supply, error::invalid_state(E_SOLD_OUT));
        assert!(timestamp::now_seconds() <= deadline, error::invalid_state(E_QUOTE_EXPIRED));
        assert!(!nonce_used(&cfg.used_nonces, &nonce), error::invalid_state(E_QUOTE_USED));

        let buyer_addr = signer::address_of(buyer);

        let msg = vector::empty<u8>();
        vector::append(&mut msg, bcs_address(buyer_addr));
        vector::append(&mut msg, bcs_u64(usdc_amount));
        vector::append(&mut msg, bcs_u64(quantity));
        vector::append(&mut msg, nonce);
        vector::append(&mut msg, bcs_u64(deadline));
        vector::append(&mut msg, account_hash);

        verify_sig(&cfg.quote_signer_pubkey, &signature, msg);

        // Pull USDC.
        let usdc = object::address_to_object<Metadata>(cfg.usdc_metadata);
        primary_fungible_store::transfer(buyer, usdc, cfg.treasury, usdc_amount);

        // Mint quantity tokens via the resource-account signer.
        let resource_signer = &account::create_signer_with_capability(&cfg.signer_cap);
        let i = 0;
        while (i < quantity) {
            let token_index = cfg.next_token_index;
            let token_name = format_token_name(&cfg.collection_name, token_index);
            let token_uri = format_token_uri(&cfg.token_uri_base, token_index);
            let token_ctor = token::create(
                resource_signer,
                cfg.collection_name,
                string::utf8(b"Demon King NFT"),
                token_name,
                option::none(),
                token_uri,
            );

            // Initialize the token's PropertyMap with level=1, then store
            // the MutatorRef on the token's own address for later upgrades.
            let property_ctor = property_map::prepare_input(
                vector::empty<String>(), vector::empty<String>(), vector::empty<vector<u8>>(),
            );
            property_map::init(&token_ctor, property_ctor);
            let mutator_ref = property_map::generate_mutator_ref(&token_ctor);
            property_map::add_typed<u8>(
                &mutator_ref,
                string::utf8(LEVEL_KEY),
                1u8,
            );

            // Persist the MutatorRef so `upgrade_with_quote` can mutate the
            // level later. Stored at the token object's own address.
            let token_signer = object::generate_signer(&token_ctor);
            move_to(&token_signer, TokenRefs { mutator: mutator_ref, token_index });

            // Transfer the new token object to the buyer.
            let token_obj = object::object_from_constructor_ref<Token>(&token_ctor);
            let token_address = object::object_address(&token_obj);
            object::transfer(resource_signer, token_obj, buyer_addr);

            event::emit_event(&mut cfg.minted_events, MintedEvent {
                buyer: buyer_addr,
                token_address,
                token_index,
                usd_amount_paid: usdc_amount / quantity,
                nonce,
            });

            cfg.next_token_index = token_index + 1;
            cfg.total_minted = cfg.total_minted + 1;
            i = i + 1;
        };

        vector::push_back(&mut cfg.used_nonces, nonce);
    }

    /// Mint NFTs with USDC or native APT, selected by `payment_metadata`.
    /// Quote message bytes:
    ///   buyer_addr ‖ payment_metadata ‖ payment_amount ‖ quantity
    ///     ‖ nonce ‖ deadline ‖ account_hash
    public entry fun mint_with_quote_payment(
        buyer: &signer,
        payment_metadata: address,
        payment_amount: u64,
        quantity: u64,
        nonce: vector<u8>,
        deadline: u64,
        account_hash: vector<u8>,
        signature: vector<u8>,
    ) acquires Config {
        let cfg = borrow_global_mut<Config>(@clash_nft);
        assert!(cfg.sale_active, error::invalid_state(E_SALE_INACTIVE));
        assert!(quantity > 0 && quantity <= cfg.max_per_tx, error::invalid_argument(E_BAD_QUANTITY));
        assert!(cfg.total_minted + quantity <= cfg.max_supply, error::invalid_state(E_SOLD_OUT));
        assert!(timestamp::now_seconds() <= deadline, error::invalid_state(E_QUOTE_EXPIRED));
        assert!(!nonce_used(&cfg.used_nonces, &nonce), error::invalid_state(E_QUOTE_USED));
        assert!(
            payment_metadata == cfg.usdc_metadata || payment_metadata == @0xa,
            error::invalid_argument(E_BAD_PAYMENT)
        );

        let buyer_addr = signer::address_of(buyer);

        let msg = vector::empty<u8>();
        vector::append(&mut msg, bcs_address(buyer_addr));
        vector::append(&mut msg, bcs_address(payment_metadata));
        vector::append(&mut msg, bcs_u64(payment_amount));
        vector::append(&mut msg, bcs_u64(quantity));
        vector::append(&mut msg, nonce);
        vector::append(&mut msg, bcs_u64(deadline));
        vector::append(&mut msg, account_hash);

        verify_sig(&cfg.quote_signer_pubkey, &signature, msg);

        let payment_asset = object::address_to_object<Metadata>(payment_metadata);
        primary_fungible_store::transfer(buyer, payment_asset, cfg.treasury, payment_amount);

        let resource_signer = &account::create_signer_with_capability(&cfg.signer_cap);
        let i = 0;
        while (i < quantity) {
            let token_index = cfg.next_token_index;
            let token_name = format_token_name(&cfg.collection_name, token_index);
            let token_uri = format_token_uri(&cfg.token_uri_base, token_index);
            let token_ctor = token::create(
                resource_signer,
                cfg.collection_name,
                string::utf8(b"Demon King NFT"),
                token_name,
                option::none(),
                token_uri,
            );

            let property_ctor = property_map::prepare_input(
                vector::empty<String>(), vector::empty<String>(), vector::empty<vector<u8>>(),
            );
            property_map::init(&token_ctor, property_ctor);
            let mutator_ref = property_map::generate_mutator_ref(&token_ctor);
            property_map::add_typed<u8>(
                &mutator_ref,
                string::utf8(LEVEL_KEY),
                1u8,
            );

            let token_signer = object::generate_signer(&token_ctor);
            move_to(&token_signer, TokenRefs { mutator: mutator_ref, token_index });

            let token_obj = object::object_from_constructor_ref<Token>(&token_ctor);
            let token_address = object::object_address(&token_obj);
            object::transfer(resource_signer, token_obj, buyer_addr);

            event::emit_event(&mut cfg.minted_events, MintedEvent {
                buyer: buyer_addr,
                token_address,
                token_index,
                usd_amount_paid: payment_amount / quantity,
                nonce,
            });

            cfg.next_token_index = token_index + 1;
            cfg.total_minted = cfg.total_minted + 1;
            i = i + 1;
        };

        vector::push_back(&mut cfg.used_nonces, nonce);
    }

    // ─── Upgrade ───────────────────────────────────────────────────

    /// Upgrade a token's level by exactly 1 (L1→L2 or L2→L3).
    /// Quote message bytes:
    ///   owner_addr ‖ token_addr ‖ new_level (u8) ‖ usdc_amount (u64)
    ///     ‖ nonce ‖ deadline (u64)
    public entry fun upgrade_with_quote(
        owner: &signer,
        token_address: address,
        new_level: u8,
        usdc_amount: u64,
        nonce: vector<u8>,
        deadline: u64,
        signature: vector<u8>,
    ) acquires Config, TokenRefs {
        let cfg = borrow_global_mut<Config>(@clash_nft);
        assert!(timestamp::now_seconds() <= deadline, error::invalid_state(E_QUOTE_EXPIRED));
        assert!(!nonce_used(&cfg.used_nonces, &nonce), error::invalid_state(E_QUOTE_USED));
        assert!(new_level >= 2 && new_level <= MAX_LEVEL, error::invalid_argument(E_BAD_LEVEL));

        let owner_addr = signer::address_of(owner);
        let token_obj = object::address_to_object<Token>(token_address);
        assert!(object::is_owner(token_obj, owner_addr), error::permission_denied(E_NOT_OWNER));

        // Read current level — must equal new_level - 1.
        let current = read_level_or_default(token_address);
        assert!(new_level == current + 1, error::invalid_argument(E_BAD_LEVEL));

        // Verify quote.
        let msg = vector::empty<u8>();
        vector::append(&mut msg, bcs_address(owner_addr));
        vector::append(&mut msg, bcs_address(token_address));
        vector::push_back(&mut msg, new_level);
        vector::append(&mut msg, bcs_u64(usdc_amount));
        vector::append(&mut msg, nonce);
        vector::append(&mut msg, bcs_u64(deadline));
        verify_sig(&cfg.quote_signer_pubkey, &signature, msg);

        // Pull USDC.
        let usdc = object::address_to_object<Metadata>(cfg.usdc_metadata);
        primary_fungible_store::transfer(owner, usdc, cfg.treasury, usdc_amount);

        // Update level via the stored MutatorRef at the token's address.
        // (Stored during mint_with_quote via move_to(token_signer, …).)
        assert!(exists<TokenRefs>(token_address), error::not_found(E_NOT_INITIALIZED));
        let refs = borrow_global<TokenRefs>(token_address);
        property_map::update_typed<u8>(&refs.mutator, &string::utf8(LEVEL_KEY), new_level);

        event::emit_event(&mut cfg.upgraded_events, LevelUpgradedEvent {
            owner: owner_addr,
            token_address,
            old_level: current,
            new_level,
            usd_amount_paid: usdc_amount,
            nonce,
        });
        vector::push_back(&mut cfg.used_nonces, nonce);
    }

    // ─── Bridge burn ───────────────────────────────────────────────

    /// Owner burns their token to bridge to Base. Server picks up the
    /// BridgeBurnEvent and signs an EIP-712 receipt redeemable on Base
    /// via `bridgeMint`.
    public entry fun bridge_burn(
        owner: &signer,
        token_address: address,
        destination_chain_id: u64,
    ) acquires Config, TokenRefs, BurnStats, BridgeFeeConfig {
        let cfg = borrow_global_mut<Config>(@clash_nft);
        let owner_addr = signer::address_of(owner);
        let token_obj = object::address_to_object<Token>(token_address);
        assert!(object::is_owner(token_obj, owner_addr), error::permission_denied(E_NOT_OWNER));

        let fee_octas = bridge_fee_octas_internal();
        if (fee_octas > 0) {
            aptos_account::transfer(owner, cfg.treasury, fee_octas);
        };

        let level = read_level_or_default(token_address);
        let token_index = if (exists<TokenRefs>(token_address)) {
            borrow_global<TokenRefs>(token_address).token_index
        } else {
            0u64   // legacy token without stored refs — index unknown, indexer can ignore
        };

        // Emit event BEFORE burn — the indexer reads it.
        event::emit_event(&mut cfg.burned_events, BridgeBurnEvent {
            owner: owner_addr,
            token_address,
            level,
            destination_chain_id,
            token_index,
        });

        // We cannot actually delete the on-chain Token object from
        // user-land code; instead we transfer ownership to the resource
        // account and rely on indexers to treat that as "burned". This
        // matches the conventional Aptos bridge pattern.
        let resource_addr = cfg.resource_addr;
        object::transfer(owner, token_obj, resource_addr);

        // Count this burn so off-chain `current_supply()` decrements. The
        // BurnStats resource must already exist — admin runs init_burn_stats
        // once after the upgrade. If not yet initialised the bridge_burn
        // aborts so we never silently undercount.
        let stats = borrow_global_mut<BurnStats>(@clash_nft);
        stats.total_burned = stats.total_burned + 1;
    }

    /// Persistent counter for tokens removed via bridge_burn. Stored at
    /// @clash_nft (admin) account; created once via `init_burn_stats`.
    /// Move's upgrade rules forbid adding fields to existing structs, so we
    /// keep this counter in its own resource rather than extending Config.
    struct BurnStats has key {
        total_burned: u64,
    }

    /// Admin-only: create the BurnStats resource. Idempotent — calling
    /// twice is a no-op. Must be called once after publishing the v3.2
    /// module before any new bridge_burn invocations.
    public entry fun init_burn_stats(admin: &signer) {
        let admin_addr = signer::address_of(admin);
        assert!(admin_addr == @clash_nft, error::permission_denied(E_NOT_OWNER));
        if (!exists<BurnStats>(@clash_nft)) {
            move_to(admin, BurnStats { total_burned: 0 });
        }
    }

    /// Admin-only: backfill the BurnStats counter for bridge_burn calls
    /// that happened BEFORE the v3.2 upgrade. Off-chain indexers count the
    /// historical BridgeBurnEvents and pass the total here. The function
    /// only allows the counter to GROW (never shrink) so a bad backfill
    /// can't artificially inflate currentSupply().
    public entry fun admin_set_total_burned(admin: &signer, new_value: u64)
        acquires BurnStats
    {
        let admin_addr = signer::address_of(admin);
        assert!(admin_addr == @clash_nft, error::permission_denied(E_NOT_OWNER));
        assert!(exists<BurnStats>(@clash_nft), error::invalid_state(E_NOT_OWNER));
        let stats = borrow_global_mut<BurnStats>(@clash_nft);
        if (new_value > stats.total_burned) {
            stats.total_burned = new_value;
        };
    }

    #[view]
    /// Live token count = lifetime mints − tokens removed via bridge_burn.
    /// Mirrors the EVM contracts' `currentSupply()` view so the server can
    /// sum across all chains for a stable global counter.
    public fun current_supply(): u64 acquires Config, BurnStats {
        let cfg = borrow_global<Config>(@clash_nft);
        let burned = if (exists<BurnStats>(@clash_nft)) {
            borrow_global<BurnStats>(@clash_nft).total_burned
        } else { 0 };
        cfg.total_minted - burned
    }

    #[view]
    public fun total_burned(): u64 acquires BurnStats {
        if (exists<BurnStats>(@clash_nft)) {
            borrow_global<BurnStats>(@clash_nft).total_burned
        } else { 0 }
    }

    #[view]
    public fun get_bridge_fee_octas(): u64 acquires BridgeFeeConfig {
        bridge_fee_octas_internal()
    }

    // ─── Bridge mint ───────────────────────────────────────────────

    /// Mints a NEW Aptos NFT at the receipt's level when an asset was
    /// burned on another chain. Authorised by a server-signed ed25519
    /// receipt. Anyone can submit (`caller`); the recipient is encoded
    /// in the receipt. `source_ref` must be unique — replays revert.
    ///
    /// Signed payload (BCS):
    ///   to ‖ level (u8) ‖ source_ref (32B) ‖ destination_chain_id (u64) ‖ deadline (u64)
    public entry fun bridge_mint(
        _caller: &signer,
        to: address,
        level: u8,
        source_ref: vector<u8>,
        destination_chain_id: u64,
        deadline: u64,
        signature: vector<u8>,
    ) acquires Config {
        let cfg = borrow_global_mut<Config>(@clash_nft);
        assert!(level >= 1 && level <= MAX_LEVEL, error::invalid_argument(E_BAD_LEVEL));
        assert!(timestamp::now_seconds() <= deadline, error::invalid_state(E_QUOTE_EXPIRED));
        assert!(!nonce_used(&cfg.used_nonces, &source_ref), error::invalid_state(E_QUOTE_USED));
        assert!(cfg.total_minted + 1 <= cfg.max_supply, error::invalid_state(E_SOLD_OUT));

        // Verify ed25519 signature over BCS-concatenated message.
        let msg = vector::empty<u8>();
        vector::append(&mut msg, bcs_address(to));
        vector::push_back(&mut msg, level);
        vector::append(&mut msg, source_ref);
        vector::append(&mut msg, bcs_u64(destination_chain_id));
        vector::append(&mut msg, bcs_u64(deadline));
        verify_sig(&cfg.quote_signer_pubkey, &signature, msg);

        // Replay-protect.
        vector::push_back(&mut cfg.used_nonces, source_ref);

        // Mint via resource-account signer (collection authority).
        let resource_signer = &account::create_signer_with_capability(&cfg.signer_cap);
        let token_index = cfg.next_token_index;
        let token_name = format_token_name(&cfg.collection_name, token_index);
        let token_uri = format_token_uri(&cfg.token_uri_base, token_index);
        let token_ctor = token::create(
            resource_signer,
            cfg.collection_name,
            string::utf8(b"Demon King NFT (bridged)"),
            token_name,
            option::none(),
            token_uri,
        );

        // Initialize PropertyMap with the preserved level (1, 2, or 3).
        let property_ctor = property_map::prepare_input(
            vector::empty<String>(), vector::empty<String>(), vector::empty<vector<u8>>(),
        );
        property_map::init(&token_ctor, property_ctor);
        let mutator_ref = property_map::generate_mutator_ref(&token_ctor);
        property_map::add_typed<u8>(&mutator_ref, string::utf8(LEVEL_KEY), level);

        // Persist MutatorRef for future `upgrade_with_quote` calls.
        let token_signer = object::generate_signer(&token_ctor);
        move_to(&token_signer, TokenRefs { mutator: mutator_ref, token_index });

        let token_obj = object::object_from_constructor_ref<Token>(&token_ctor);
        let token_address = object::object_address(&token_obj);
        object::transfer(resource_signer, token_obj, to);

        // Reuse MintedEvent: the `nonce` field carries the source_ref so
        // indexers can correlate this mint with the originating burn on
        // another chain. usd_amount_paid is 0 because bridges are free
        // (cost was already paid at original mint on the source chain).
        event::emit_event(&mut cfg.minted_events, MintedEvent {
            buyer: to,
            token_address,
            token_index,
            usd_amount_paid: 0,
            nonce: source_ref,
        });

        cfg.next_token_index = token_index + 1;
        cfg.total_minted = cfg.total_minted + 1;
    }

    // ─── Helpers ───────────────────────────────────────────────────

    fun nonce_used(used: &vector<vector<u8>>, nonce: &vector<u8>): bool {
        let len = vector::length(used);
        let i = 0;
        while (i < len) {
            if (vector::borrow(used, i) == nonce) {
                return true
            };
            i = i + 1;
        };
        false
    }

    fun verify_sig(pubkey: &vector<u8>, signature: &vector<u8>, msg: vector<u8>) {
        let pk = ed25519::new_unvalidated_public_key_from_bytes(*pubkey);
        let sig = ed25519::new_signature_from_bytes(*signature);
        assert!(
            ed25519::signature_verify_strict(&sig, &pk, msg),
            error::permission_denied(E_BAD_SIGNATURE),
        );
    }

    fun bridge_fee_octas_internal(): u64 acquires BridgeFeeConfig {
        if (exists<BridgeFeeConfig>(@clash_nft)) {
            borrow_global<BridgeFeeConfig>(@clash_nft).fee_octas
        } else { 0 }
    }

    fun bcs_address(addr: address): vector<u8> {
        std::bcs::to_bytes(&addr)
    }

    fun bcs_u64(value: u64): vector<u8> {
        std::bcs::to_bytes(&value)
    }

    /// Returns the level stored in the token's PropertyMap, defaulting to 1
    /// if no `level` key exists (legacy tokens).
    fun read_level_or_default(token_address: address): u8 {
        // PropertyMap is stored at the token's object address. We read it
        // via the property_map public view.
        let token_obj = object::address_to_object<Token>(token_address);
        if (!property_map::contains_key(&token_obj, &string::utf8(LEVEL_KEY))) {
            return 1u8
        };
        property_map::read_u8(&token_obj, &string::utf8(LEVEL_KEY))
    }

    fun format_token_name(collection_name: &String, index: u64): String {
        let s = *collection_name;
        string::append(&mut s, string::utf8(b" #"));
        string::append(&mut s, num_to_string(index));
        s
    }

    fun format_token_uri(base: &String, index: u64): String {
        let s = *base;
        string::append(&mut s, num_to_string(index));
        s
    }

    fun num_to_string(n: u64): String {
        if (n == 0) {
            return string::utf8(b"0")
        };
        let buf = vector::empty<u8>();
        let m = n;
        while (m > 0) {
            vector::push_back(&mut buf, ((m % 10) as u8) + 48u8);
            m = m / 10;
        };
        vector::reverse(&mut buf);
        string::utf8(buf)
    }

    // ─── View functions ────────────────────────────────────────────

    #[view]
    public fun get_total_minted(): u64 acquires Config {
        borrow_global<Config>(@clash_nft).total_minted
    }

    #[view]
    public fun get_max_supply(): u64 acquires Config {
        borrow_global<Config>(@clash_nft).max_supply
    }

    #[view]
    public fun get_sale_active(): bool acquires Config {
        borrow_global<Config>(@clash_nft).sale_active
    }

    #[view]
    public fun get_treasury(): address acquires Config {
        borrow_global<Config>(@clash_nft).treasury
    }

    #[view]
    public fun get_collection_addr(): address acquires Config {
        borrow_global<Config>(@clash_nft).collection_addr
    }

    #[view]
    public fun get_resource_addr(): address acquires Config {
        borrow_global<Config>(@clash_nft).resource_addr
    }

    #[view]
    public fun get_quote_signer_pubkey(): vector<u8> acquires Config {
        borrow_global<Config>(@clash_nft).quote_signer_pubkey
    }

    #[view]
    public fun get_upgrade_price(): u64 acquires Config {
        borrow_global<Config>(@clash_nft).upgrade_usd_price_e6
    }

    #[view]
    public fun get_token_level(token_address: address): u8 {
        read_level_or_default(token_address)
    }
}
