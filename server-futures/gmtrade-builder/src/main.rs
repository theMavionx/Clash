use std::{
    collections::{HashMap, HashSet},
    io::{self, Read},
    sync::Arc,
};

use anyhow::{anyhow, Context, Result};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use gmsol_sdk::{
    builders::{
        order::{
            CreateOrder, CreateOrderHint, CreateOrderKind, CreateOrderParams,
            DecreasePositionSwapType,
        },
        token::{PrepareTokenAccounts, WrapNative},
        user::PrepareUser,
        StoreProgram,
    },
    programs::{constants::MARKET_DECIMALS, gmsol_store::events::TradeEvent},
    serde::StringPubkey,
    utils::events::decode_anchor_event_with_options,
    IntoAtomicGroup,
};
use gmsol_solana_utils::{
    instruction_group::ComputeBudgetOptions,
    signer::TransactionSigners,
    transaction_builder::default_before_sign,
    transaction_group::{TransactionGroup, TransactionGroupOptions},
    ParallelGroup,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use solana_sdk::{hash::Hash, pubkey::Pubkey, signature::NullSigner};

#[derive(Debug, Deserialize)]
struct BuildRequest {
    payer: String,
    recent_blockhash: String,
    nonce: String,
    kind: String,
    market_token: String,
    long_token: String,
    short_token: String,
    collateral_token: String,
    #[serde(default)]
    pay_token: Option<String>,
    #[serde(default)]
    receive_token: Option<String>,
    #[serde(default)]
    execution_lamports: Option<u64>,
    #[serde(default)]
    swap_path: Vec<String>,
    #[serde(default)]
    size: String,
    #[serde(default)]
    amount: String,
    #[serde(default)]
    min_output: String,
    #[serde(default)]
    trigger_price: Option<String>,
    #[serde(default)]
    acceptable_price: Option<String>,
    #[serde(default)]
    is_long: bool,
    #[serde(default)]
    skip_unwrap_native_on_receive: bool,
    #[serde(default)]
    skip_wrap_native_on_pay: bool,
    #[serde(default)]
    force_create_positions: bool,
    #[serde(default)]
    force_create_positions_in_parallel: bool,
    #[serde(default)]
    compute_unit_price_micro_lamports: Option<u64>,
    #[serde(default)]
    compute_unit_min_priority_lamports: Option<u64>,
    #[serde(default = "default_max_instructions")]
    max_instructions_per_tx: usize,
    #[serde(default = "default_max_tx_size")]
    max_transaction_size: usize,
    #[serde(default)]
    memo: Option<String>,
}

#[derive(Debug, Serialize)]
struct BuildResponse {
    ok: bool,
    transactions: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct DecodeTradeEventsRequest {
    #[serde(default)]
    events: Vec<String>,
}

#[derive(Debug, Serialize)]
struct DecodedTradeEvent {
    user: String,
    store: String,
    market_token: String,
    order: String,
    position: String,
    side: String,
    is_increase: bool,
    size_delta_raw: String,
    size_delta_usd: f64,
    before_size_raw: String,
    after_size_raw: String,
    execution_price_raw: String,
    slot: u64,
    ts: i64,
}

#[derive(Debug, Serialize)]
struct DecodeTradeEventsResponse {
    ok: bool,
    events: Vec<DecodedTradeEvent>,
}

fn default_max_instructions() -> usize {
    24
}

fn default_max_tx_size() -> usize {
    1232
}

fn pubkey(value: &str, label: &str) -> Result<Pubkey> {
    value
        .parse()
        .with_context(|| format!("invalid {label} pubkey"))
}

fn string_pubkey(value: &str, label: &str) -> Result<StringPubkey> {
    Ok(StringPubkey(pubkey(value, label)?))
}

fn parse_u128(value: &str, label: &str) -> Result<u128> {
    let normalized = if value.trim().is_empty() {
        "0"
    } else {
        value.trim()
    };
    normalized
        .parse::<u128>()
        .with_context(|| format!("invalid {label} integer"))
}

fn raw_usd_to_f64(value: u128) -> f64 {
    value as f64 / 10f64.powi(MARKET_DECIMALS as i32)
}

fn decode_trade_events(request: DecodeTradeEventsRequest) -> Result<DecodeTradeEventsResponse> {
    let mut events = Vec::new();
    for encoded in request.events {
        let bytes = BASE64
            .decode(encoded.trim())
            .context("invalid base64 trade event")?;
        let event: TradeEvent = decode_anchor_event_with_options(&bytes, false)
            .or_else(|_| decode_anchor_event_with_options(&bytes, true))
            .context("invalid GMTrade trade event")?;
        let before = event.before.size_in_usd;
        let after = event.after.size_in_usd;
        let is_increase = after >= before;
        let size_delta = if is_increase {
            after.saturating_sub(before)
        } else {
            before.saturating_sub(after)
        };
        events.push(DecodedTradeEvent {
            user: event.user.to_string(),
            store: event.store.to_string(),
            market_token: event.market_token.to_string(),
            order: event.order.to_string(),
            position: event.position.to_string(),
            side: if event.is_long() { "long" } else { "short" }.to_string(),
            is_increase,
            size_delta_raw: size_delta.to_string(),
            size_delta_usd: raw_usd_to_f64(size_delta),
            before_size_raw: before.to_string(),
            after_size_raw: after.to_string(),
            execution_price_raw: event.execution_price.to_string(),
            slot: event.slot,
            ts: event.ts,
        });
    }
    Ok(DecodeTradeEventsResponse { ok: true, events })
}

fn order_kind(value: &str) -> Result<CreateOrderKind> {
    match value {
        "MarketIncrease" | "market_increase" | "market" => Ok(CreateOrderKind::MarketIncrease),
        "LimitIncrease" | "limit_increase" | "limit" => Ok(CreateOrderKind::LimitIncrease),
        "MarketDecrease" | "market_decrease" | "close_market" => {
            Ok(CreateOrderKind::MarketDecrease)
        }
        "LimitDecrease" | "limit_decrease" | "close_limit" => Ok(CreateOrderKind::LimitDecrease),
        "StopLossDecrease" | "stop_loss" => Ok(CreateOrderKind::StopLossDecrease),
        "MarketSwap" | "market_swap" => Ok(CreateOrderKind::MarketSwap),
        "LimitSwap" | "limit_swap" => Ok(CreateOrderKind::LimitSwap),
        _ => Err(anyhow!("unsupported GMTrade order kind: {value}")),
    }
}

fn create_order(
    request: &BuildRequest,
    kind: CreateOrderKind,
) -> Result<gmsol_solana_utils::AtomicGroup> {
    let market_token = string_pubkey(&request.market_token, "market_token")?;
    let collateral_token = string_pubkey(&request.collateral_token, "collateral_token")?;
    let pay_token = match request.pay_token.as_deref() {
        Some(value) if !value.trim().is_empty() => Some(string_pubkey(value, "pay_token")?),
        _ => None,
    };
    let receive_token = match request.receive_token.as_deref() {
        Some(value) if !value.trim().is_empty() => Some(string_pubkey(value, "receive_token")?),
        _ => None,
    };
    let hint = CreateOrderHint::builder()
        .long_token(string_pubkey(&request.long_token, "long_token")?)
        .short_token(string_pubkey(&request.short_token, "short_token")?)
        .build();
    let mut params = CreateOrderParams::builder()
        .market_token(market_token)
        .is_long(request.is_long)
        .size(parse_u128(&request.size, "size")?)
        .amount(parse_u128(&request.amount, "amount")?)
        .min_output(parse_u128(&request.min_output, "min_output")?)
        .build();
    if let Some(value) = request.trigger_price.as_deref() {
        params.trigger_price = Some(parse_u128(value, "trigger_price")?);
    }
    if let Some(value) = request.acceptable_price.as_deref() {
        params.acceptable_price = Some(parse_u128(value, "acceptable_price")?);
    }
    if matches!(
        kind,
        CreateOrderKind::MarketDecrease
            | CreateOrderKind::LimitDecrease
            | CreateOrderKind::StopLossDecrease
    ) {
        params.decrease_position_swap_type = Some(DecreasePositionSwapType::NoSwap);
    }
    Ok(CreateOrder::builder()
        .program(StoreProgram::default())
        .payer(string_pubkey(&request.payer, "payer")?)
        .nonce(string_pubkey(&request.nonce, "nonce")?)
        .execution_lamports(request.execution_lamports)
        .kind(kind)
        .collateral_or_swap_out_token(collateral_token)
        .params(params)
        .pay_token(pay_token)
        .receive_token(receive_token)
        .swap_path(
            request
                .swap_path
                .iter()
                .map(|s| string_pubkey(s, "swap_path"))
                .collect::<Result<Vec<_>>>()?,
        )
        .unwrap_native_on_receive(!request.skip_unwrap_native_on_receive)
        .skip_position_creation(false)
        .force_position_creation(request.force_create_positions_in_parallel)
        .build()
        .into_atomic_group(&hint)?)
}

fn build_transactions(request: BuildRequest) -> Result<BuildResponse> {
    let payer = string_pubkey(&request.payer, "payer")?;
    let kind = order_kind(&request.kind)?;
    let mut tokens = HashSet::<StringPubkey>::new();
    let pay_token = request
        .pay_token
        .as_deref()
        .unwrap_or(&request.collateral_token);
    let wrap_native = (matches!(
        kind,
        CreateOrderKind::MarketIncrease
            | CreateOrderKind::LimitIncrease
            | CreateOrderKind::MarketSwap
            | CreateOrderKind::LimitSwap
    )) && pubkey(pay_token, "pay_token")? == WrapNative::NATIVE_MINT
        && !request.skip_wrap_native_on_pay;
    if wrap_native {
        tokens.insert(StringPubkey(WrapNative::NATIVE_MINT));
    }
    if matches!(
        kind,
        CreateOrderKind::MarketDecrease
            | CreateOrderKind::LimitDecrease
            | CreateOrderKind::StopLossDecrease
            | CreateOrderKind::MarketSwap
            | CreateOrderKind::LimitSwap
    ) {
        tokens.insert(string_pubkey(
            request
                .receive_token
                .as_deref()
                .unwrap_or(&request.collateral_token),
            "receive_token",
        )?);
    }
    if !matches!(
        kind,
        CreateOrderKind::MarketSwap | CreateOrderKind::LimitSwap
    ) {
        tokens.insert(string_pubkey(&request.long_token, "long_token")?);
        tokens.insert(string_pubkey(&request.short_token, "short_token")?);
    }

    let prepare_user = PrepareUser::builder()
        .payer(payer)
        .build()
        .into_atomic_group(&())?;
    let prepare_tokens = PrepareTokenAccounts::builder()
        .owner(payer)
        .payer(payer)
        .tokens(tokens)
        .build()
        .into_atomic_group(&())?;
    let create = create_order(&request, kind)?;

    let mut group = TransactionGroup::with_options_and_luts(
        TransactionGroupOptions {
            max_transaction_size: request.max_transaction_size,
            max_instructions_per_tx: request.max_instructions_per_tx,
            memo: request.memo.clone(),
            ..Default::default()
        },
        HashMap::new(),
    );
    group.add(prepare_user)?;
    group.add(prepare_tokens)?;
    group.add(ParallelGroup::from(create))?;
    group.optimize(false);

    let signers: TransactionSigners<Arc<NullSigner>> = Default::default();
    let recent_blockhash: Hash = request
        .recent_blockhash
        .parse()
        .context("invalid recent_blockhash")?;
    let mut out = Vec::new();
    for batch in group.to_transactions_with_options(
        &signers,
        recent_blockhash,
        true,
        ComputeBudgetOptions {
            without_compute_budget: false,
            compute_unit_price_micro_lamports: request.compute_unit_price_micro_lamports,
            compute_unit_min_priority_lamports: request.compute_unit_min_priority_lamports,
        },
        default_before_sign,
    ) {
        for tx in batch? {
            out.push(BASE64.encode(bincode::serialize(&tx)?));
        }
    }
    Ok(BuildResponse {
        ok: true,
        transactions: out,
    })
}

fn main() -> Result<()> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;
    let value: Value = serde_json::from_str(&input).context("invalid JSON request")?;
    if value.get("action").and_then(Value::as_str) == Some("decode_trade_events") {
        let request: DecodeTradeEventsRequest =
            serde_json::from_value(value).context("invalid decode_trade_events request")?;
        let response = decode_trade_events(request)?;
        println!("{}", serde_json::to_string(&response)?);
        return Ok(());
    }
    let request: BuildRequest = serde_json::from_value(value).context("invalid build request")?;
    let response = build_transactions(request)?;
    println!("{}", serde_json::to_string(&response)?);
    Ok(())
}
