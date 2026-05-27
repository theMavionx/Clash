use mpl_core::instructions::TransferV1CpiBuilder;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    sysvar::Sysvar,
};
use solana_system_interface::{instruction as system_instruction, program as system_program};
use spl_token::{instruction as token_instruction, state::Account as TokenAccount};
use spl_token::solana_program::program_pack::Pack;

entrypoint!(process_instruction);

const CONFIG_SEED: &[u8] = b"config";
const LISTING_SEED: &[u8] = b"listing";
const CONFIG_TAG: &[u8; 8] = b"CPMCONF1";
const LISTING_TAG: &[u8; 8] = b"CPMLIST1";
const SOL_MINT: Pubkey = Pubkey::new_from_array([0; 32]);
const MAX_FEE_BPS: u16 = 1_000;
const DEFAULT_MARKET_FEE_BPS: u16 = 100;

#[repr(u32)]
enum MarketplaceError {
    BadInstruction = 1,
    BadPda = 2,
    AlreadyInitialized = 3,
    NotInitialized = 4,
    NotAuthorized = 5,
    BadFee = 6,
    BadPrice = 7,
    BadExpiry = 8,
    BadCollection = 9,
    ListingInactive = 10,
    ListingExpired = 11,
    BadSeller = 12,
    BadTreasury = 13,
    WrongPaymentAccounts = 14,
    MathOverflow = 15,
}

impl From<MarketplaceError> for ProgramError {
    fn from(value: MarketplaceError) -> Self {
        ProgramError::Custom(value as u32)
    }
}

#[derive(Clone, Copy, Debug)]
struct Config {
    bump: u8,
    market_fee_bps: u16,
    authority: Pubkey,
    treasury: Pubkey,
    collection: Pubkey,
}

impl Config {
    const LEN: usize = 8 + 1 + 2 + 32 + 32 + 32 + 32;

    fn pack(&self, dst: &mut [u8]) -> ProgramResult {
        if dst.len() < Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }
        dst[..Self::LEN].fill(0);
        dst[0..8].copy_from_slice(CONFIG_TAG);
        dst[8] = self.bump;
        dst[9..11].copy_from_slice(&self.market_fee_bps.to_le_bytes());
        dst[11..43].copy_from_slice(self.authority.as_ref());
        dst[43..75].copy_from_slice(self.treasury.as_ref());
        dst[75..107].copy_from_slice(self.collection.as_ref());
        Ok(())
    }

    fn unpack(src: &[u8]) -> Result<Self, ProgramError> {
        if src.len() < Self::LEN || &src[0..8] != CONFIG_TAG {
            return Err(MarketplaceError::NotInitialized.into());
        }
        Ok(Self {
            bump: src[8],
            market_fee_bps: u16::from_le_bytes(src[9..11].try_into().unwrap()),
            authority: read_pubkey_at(src, 11)?,
            treasury: read_pubkey_at(src, 43)?,
            collection: read_pubkey_at(src, 75)?,
        })
    }
}

#[derive(Clone, Copy, Debug)]
struct Listing {
    bump: u8,
    active: bool,
    seller: Pubkey,
    asset: Pubkey,
    collection: Pubkey,
    payment_mint: Pubkey,
    price: u64,
    expires_at: i64,
}

impl Listing {
    const LEN: usize = 8 + 1 + 1 + 32 + 32 + 32 + 32 + 8 + 8;

    fn pack(&self, dst: &mut [u8]) -> ProgramResult {
        if dst.len() < Self::LEN {
            return Err(ProgramError::AccountDataTooSmall);
        }
        dst[..Self::LEN].fill(0);
        dst[0..8].copy_from_slice(LISTING_TAG);
        dst[8] = self.bump;
        dst[9] = u8::from(self.active);
        dst[10..42].copy_from_slice(self.seller.as_ref());
        dst[42..74].copy_from_slice(self.asset.as_ref());
        dst[74..106].copy_from_slice(self.collection.as_ref());
        dst[106..138].copy_from_slice(self.payment_mint.as_ref());
        dst[138..146].copy_from_slice(&self.price.to_le_bytes());
        dst[146..154].copy_from_slice(&self.expires_at.to_le_bytes());
        Ok(())
    }

    fn unpack(src: &[u8]) -> Result<Self, ProgramError> {
        if src.len() < Self::LEN || &src[0..8] != LISTING_TAG {
            return Err(MarketplaceError::NotInitialized.into());
        }
        Ok(Self {
            bump: src[8],
            active: src[9] != 0,
            seller: read_pubkey_at(src, 10)?,
            asset: read_pubkey_at(src, 42)?,
            collection: read_pubkey_at(src, 74)?,
            payment_mint: read_pubkey_at(src, 106)?,
            price: u64::from_le_bytes(src[138..146].try_into().unwrap()),
            expires_at: i64::from_le_bytes(src[146..154].try_into().unwrap()),
        })
    }
}

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    input: &[u8],
) -> ProgramResult {
    let (&tag, data) = input.split_first().ok_or(MarketplaceError::BadInstruction)?;
    match tag {
        0 => process_initialize(program_id, accounts, data),
        1 => process_update_config(program_id, accounts, data),
        2 => process_list(program_id, accounts, data),
        3 => process_cancel(program_id, accounts),
        4 => process_buy(program_id, accounts),
        _ => Err(MarketplaceError::BadInstruction.into()),
    }
}

fn process_initialize(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let market_fee_bps = read_u16(data, 0).unwrap_or(DEFAULT_MARKET_FEE_BPS);
    validate_fee(market_fee_bps)?;

    let account_info_iter = &mut accounts.iter();
    let authority = next_account_info(account_info_iter)?;
    let config_account = next_account_info(account_info_iter)?;
    let treasury = next_account_info(account_info_iter)?;
    let collection = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;

    require_signer(authority)?;
    require_system_program(system_program)?;
    let bump = assert_config_pda(program_id, config_account)?;
    if config_account.owner == program_id && config_account.data_len() >= Config::LEN {
        return Err(MarketplaceError::AlreadyInitialized.into());
    }

    create_pda_account(
        authority,
        config_account,
        system_program,
        program_id,
        Config::LEN,
        &[CONFIG_SEED, &[bump]],
    )?;

    let config = Config {
        bump,
        market_fee_bps,
        authority: *authority.key,
        treasury: *treasury.key,
        collection: *collection.key,
    };
    config.pack(&mut config_account.data.borrow_mut())?;
    msg!("clash_marketplace_initialized fee_bps={}", market_fee_bps);
    Ok(())
}

fn process_update_config(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let market_fee_bps = read_u16(data, 0).ok_or(MarketplaceError::BadInstruction)?;
    validate_fee(market_fee_bps)?;

    let account_info_iter = &mut accounts.iter();
    let authority = next_account_info(account_info_iter)?;
    let config_account = next_account_info(account_info_iter)?;
    let treasury = next_account_info(account_info_iter)?;
    let collection = next_account_info(account_info_iter)?;

    require_signer(authority)?;
    assert_config_pda(program_id, config_account)?;
    let mut config = Config::unpack(&config_account.data.borrow())?;
    if config.authority != *authority.key {
        return Err(MarketplaceError::NotAuthorized.into());
    }
    config.market_fee_bps = market_fee_bps;
    config.treasury = *treasury.key;
    config.collection = *collection.key;
    config.pack(&mut config_account.data.borrow_mut())?;
    msg!("clash_marketplace_config_updated fee_bps={}", market_fee_bps);
    Ok(())
}

fn process_list(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let price = read_u64(data, 0).ok_or(MarketplaceError::BadInstruction)?;
    let payment_mint = read_pubkey_at(data, 8)?;
    let expires_at = read_i64(data, 40).ok_or(MarketplaceError::BadInstruction)?;
    if price == 0 {
        return Err(MarketplaceError::BadPrice.into());
    }
    validate_future_expiry(expires_at)?;

    let account_info_iter = &mut accounts.iter();
    let seller = next_account_info(account_info_iter)?;
    let config_account = next_account_info(account_info_iter)?;
    let listing_account = next_account_info(account_info_iter)?;
    let asset = next_account_info(account_info_iter)?;
    let collection = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;

    require_signer(seller)?;
    require_system_program(system_program)?;
    assert_config_pda(program_id, config_account)?;
    let config = Config::unpack(&config_account.data.borrow())?;
    if config.collection != *collection.key {
        return Err(MarketplaceError::BadCollection.into());
    }

    let bump = assert_listing_pda(program_id, listing_account, asset.key)?;
    if listing_account.owner == program_id && listing_account.data_len() >= Listing::LEN {
        let existing = Listing::unpack(&listing_account.data.borrow())?;
        if existing.active {
            return Err(MarketplaceError::AlreadyInitialized.into());
        }
    } else {
        create_pda_account(
            seller,
            listing_account,
            system_program,
            program_id,
            Listing::LEN,
            &[LISTING_SEED, asset.key.as_ref(), &[bump]],
        )?;
    }

    let listing = Listing {
        bump,
        active: true,
        seller: *seller.key,
        asset: *asset.key,
        collection: *collection.key,
        payment_mint,
        price,
        expires_at,
    };
    listing.pack(&mut listing_account.data.borrow_mut())?;
    msg!("clash_marketplace_listed price={} fee_bps={}", price, config.market_fee_bps);
    Ok(())
}

fn process_cancel(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let seller = next_account_info(account_info_iter)?;
    let config_account = next_account_info(account_info_iter)?;
    let listing_account = next_account_info(account_info_iter)?;

    require_signer(seller)?;
    assert_config_pda(program_id, config_account)?;
    let listing = Listing::unpack(&listing_account.data.borrow())?;
    assert_listing_pda(program_id, listing_account, &listing.asset)?;
    if listing.seller != *seller.key {
        return Err(MarketplaceError::NotAuthorized.into());
    }
    close_account(listing_account, seller)?;
    msg!("clash_marketplace_cancelled");
    Ok(())
}

fn process_buy(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let buyer = next_account_info(account_info_iter)?;
    let config_account = next_account_info(account_info_iter)?;
    let listing_account = next_account_info(account_info_iter)?;
    let seller = next_account_info(account_info_iter)?;
    let treasury = next_account_info(account_info_iter)?;
    let asset = next_account_info(account_info_iter)?;
    let collection = next_account_info(account_info_iter)?;
    let core_program = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;

    require_signer(buyer)?;
    require_system_program(system_program)?;
    assert_config_pda(program_id, config_account)?;
    let config = Config::unpack(&config_account.data.borrow())?;
    let listing = Listing::unpack(&listing_account.data.borrow())?;
    assert_listing_pda(program_id, listing_account, &listing.asset)?;
    validate_active_listing(&listing)?;

    if !listing.active {
        return Err(MarketplaceError::ListingInactive.into());
    }
    if listing.seller != *seller.key {
        return Err(MarketplaceError::BadSeller.into());
    }
    if config.treasury != *treasury.key {
        return Err(MarketplaceError::BadTreasury.into());
    }
    if listing.collection != *collection.key || config.collection != *collection.key {
        return Err(MarketplaceError::BadCollection.into());
    }
    if listing.asset != *asset.key {
        return Err(MarketplaceError::BadPda.into());
    }

    let fee_amount = checked_fee(listing.price, config.market_fee_bps)?;
    let seller_amount = listing
        .price
        .checked_sub(fee_amount)
        .ok_or(MarketplaceError::MathOverflow)?;

    if listing.payment_mint == SOL_MINT {
        transfer_lamports(buyer, treasury, system_program, fee_amount)?;
        transfer_lamports(buyer, seller, system_program, seller_amount)?;
    } else {
        let buyer_token = next_account_info(account_info_iter)?;
        let seller_token = next_account_info(account_info_iter)?;
        let treasury_token = next_account_info(account_info_iter)?;
        let token_program = next_account_info(account_info_iter)?;
        require_token_program(token_program)?;
        validate_token_account(buyer_token, &listing.payment_mint, buyer.key)?;
        validate_token_account(seller_token, &listing.payment_mint, seller.key)?;
        validate_token_account(treasury_token, &listing.payment_mint, treasury.key)?;
        transfer_tokens(token_program, buyer_token, treasury_token, buyer, fee_amount)?;
        transfer_tokens(token_program, buyer_token, seller_token, buyer, seller_amount)?;
    }

    transfer_asset_to_buyer(
        listing_account,
        asset,
        collection,
        buyer,
        core_program,
        system_program,
        &listing,
    )?;
    close_account(listing_account, seller)?;
    msg!(
        "clash_marketplace_sold price={} fee={} seller_amount={}",
        listing.price,
        fee_amount,
        seller_amount
    );
    Ok(())
}

fn transfer_asset_to_buyer<'a>(
    listing_account: &AccountInfo<'a>,
    asset: &AccountInfo<'a>,
    collection: &AccountInfo<'a>,
    buyer: &AccountInfo<'a>,
    core_program: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    listing: &Listing,
) -> ProgramResult {
    let bump = [listing.bump];
    let signer_seeds: &[&[u8]] = &[LISTING_SEED, listing.asset.as_ref(), &bump];
    TransferV1CpiBuilder::new(core_program)
        .asset(asset)
        .collection(Some(collection))
        .payer(buyer)
        .authority(Some(listing_account))
        .new_owner(buyer)
        .system_program(Some(system_program))
        .invoke_signed(&[signer_seeds])
}

fn create_pda_account<'a>(
    payer: &AccountInfo<'a>,
    account: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    owner: &Pubkey,
    space: usize,
    seeds: &[&[u8]],
) -> ProgramResult {
    let rent = Rent::get()?.minimum_balance(space);
    let ix = system_instruction::create_account(
        payer.key,
        account.key,
        rent,
        space as u64,
        owner,
    );
    invoke_signed(&ix, &[payer.clone(), account.clone(), system_program.clone()], &[seeds])
}

fn transfer_lamports<'a>(
    from: &AccountInfo<'a>,
    to: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    amount: u64,
) -> ProgramResult {
    if amount == 0 {
        return Ok(());
    }
    let ix = system_instruction::transfer(from.key, to.key, amount);
    invoke(&ix, &[from.clone(), to.clone(), system_program.clone()])
}

fn transfer_tokens<'a>(
    token_program: &AccountInfo<'a>,
    source: &AccountInfo<'a>,
    destination: &AccountInfo<'a>,
    authority: &AccountInfo<'a>,
    amount: u64,
) -> ProgramResult {
    if amount == 0 {
        return Ok(());
    }
    let ix = token_instruction::transfer(
        token_program.key,
        source.key,
        destination.key,
        authority.key,
        &[],
        amount,
    )?;
    invoke(&ix, &[source.clone(), destination.clone(), authority.clone(), token_program.clone()])
}

fn close_account<'a>(account: &AccountInfo<'a>, receiver: &AccountInfo<'a>) -> ProgramResult {
    let lamports = account.lamports();
    **receiver.lamports.borrow_mut() = receiver
        .lamports()
        .checked_add(lamports)
        .ok_or(MarketplaceError::MathOverflow)?;
    **account.lamports.borrow_mut() = 0;
    account.data.borrow_mut().fill(0);
    Ok(())
}

fn validate_token_account(account_info: &AccountInfo, mint: &Pubkey, owner: &Pubkey) -> ProgramResult {
    let data = account_info.data.borrow();
    let account = TokenAccount::unpack(&data)?;
    if account.mint != *mint || account.owner != *owner {
        return Err(MarketplaceError::WrongPaymentAccounts.into());
    }
    Ok(())
}

fn validate_fee(fee_bps: u16) -> ProgramResult {
    if fee_bps > MAX_FEE_BPS {
        return Err(MarketplaceError::BadFee.into());
    }
    Ok(())
}

fn validate_future_expiry(expires_at: i64) -> ProgramResult {
    if expires_at == 0 {
        return Ok(());
    }
    let now = Clock::get()?.unix_timestamp;
    if expires_at <= now {
        return Err(MarketplaceError::BadExpiry.into());
    }
    Ok(())
}

fn validate_active_listing(listing: &Listing) -> ProgramResult {
    if listing.expires_at == 0 {
        return Ok(());
    }
    let now = Clock::get()?.unix_timestamp;
    if now >= listing.expires_at {
        return Err(MarketplaceError::ListingExpired.into());
    }
    Ok(())
}

fn checked_fee(price: u64, fee_bps: u16) -> Result<u64, ProgramError> {
    let fee = (price as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(MarketplaceError::MathOverflow)?
        / 10_000u128;
    u64::try_from(fee).map_err(|_| MarketplaceError::MathOverflow.into())
}

fn assert_config_pda(program_id: &Pubkey, account: &AccountInfo) -> Result<u8, ProgramError> {
    let (expected, bump) = Pubkey::find_program_address(&[CONFIG_SEED], program_id);
    if expected != *account.key {
        return Err(MarketplaceError::BadPda.into());
    }
    Ok(bump)
}

fn assert_listing_pda(program_id: &Pubkey, account: &AccountInfo, asset: &Pubkey) -> Result<u8, ProgramError> {
    let (expected, bump) = Pubkey::find_program_address(&[LISTING_SEED, asset.as_ref()], program_id);
    if expected != *account.key {
        return Err(MarketplaceError::BadPda.into());
    }
    Ok(bump)
}

fn require_signer(account: &AccountInfo) -> ProgramResult {
    if !account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    Ok(())
}

fn require_system_program(account: &AccountInfo) -> ProgramResult {
    if !system_program::check_id(account.key) {
        return Err(ProgramError::IncorrectProgramId);
    }
    Ok(())
}

fn require_token_program(account: &AccountInfo) -> ProgramResult {
    if *account.key != spl_token::ID {
        return Err(ProgramError::IncorrectProgramId);
    }
    Ok(())
}

fn read_u16(data: &[u8], offset: usize) -> Option<u16> {
    data.get(offset..offset + 2)
        .map(|bytes| u16::from_le_bytes(bytes.try_into().unwrap()))
}

fn read_u64(data: &[u8], offset: usize) -> Option<u64> {
    data.get(offset..offset + 8)
        .map(|bytes| u64::from_le_bytes(bytes.try_into().unwrap()))
}

fn read_i64(data: &[u8], offset: usize) -> Option<i64> {
    data.get(offset..offset + 8)
        .map(|bytes| i64::from_le_bytes(bytes.try_into().unwrap()))
}

fn read_pubkey_at(data: &[u8], offset: usize) -> Result<Pubkey, ProgramError> {
    let bytes = data
        .get(offset..offset + 32)
        .ok_or(MarketplaceError::BadInstruction)?;
    Ok(Pubkey::new_from_array(bytes.try_into().unwrap()))
}
