#!/usr/bin/env python3
import asyncio
import json
import os
import sys
import traceback


def _reply(payload, code=0):
    sys.stdout.write(json.dumps(payload, separators=(",", ":")))
    sys.stdout.flush()
    raise SystemExit(code)


def _tx_tuple(result):
    tx_type, tx_info, tx_hash, error = result
    if error is not None:
        raise RuntimeError(str(error))
    return {"tx_type": tx_type, "tx_info": tx_info, "tx_hash": tx_hash}


def _response_payload(value):
    if value is None:
        return None
    if hasattr(value, "to_dict"):
        return value.to_dict()
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if hasattr(value, "__dict__"):
        return {k: v for k, v in value.__dict__.items() if not k.startswith("_")}
    return value


def _response_error(payload):
    if payload is None:
        return None
    if not isinstance(payload, dict):
        return None
    code = payload.get("code")
    status = payload.get("status")
    message = payload.get("message") or payload.get("error") or payload.get("detail")
    if code is not None:
        try:
            if int(code) not in (0, 200):
                return f"code={code} message='{message or ''}'"
        except (TypeError, ValueError):
            return f"code={code} message='{message or ''}'"
    if isinstance(status, str) and status.lower() in ("error", "failed", "failure", "rejected"):
        return f"status={status} message='{message or ''}'"
    if message and code is None and status is None:
        lower = str(message).lower()
        if any(part in lower for part in ("error", "failed", "invalid", "rejected", "insufficient")):
            return str(message)
    return None


def _public_error(exc):
    text = str(exc)
    body = getattr(exc, "body", None)
    data = getattr(exc, "data", None)
    if data is not None:
        code = getattr(data, "code", None)
        message = getattr(data, "message", None)
        if code is not None or message:
            text = f"code={code} message='{message or ''}'"
    elif body:
        text = f"{text} body={body}"
    lower = text.lower()
    if "code=20558" in text or "restricted jurisdiction" in lower:
        return (
            "Lighter is not available from your current region. "
            "Lighter rejected the request with restricted jurisdiction code 20558."
        )
    return text


def _client(lighter, payload):
    account_index = int(payload["account_index"])
    api_key_index = int(payload["api_key_index"])
    private_key = str(payload["api_private_key"]).strip()
    if not private_key:
        raise ValueError("api_private_key is required")
    return lighter.SignerClient(
        url=str(payload.get("api_url") or "https://mainnet.zklighter.elliot.ai"),
        account_index=account_index,
        api_private_keys={api_key_index: private_key},
    )


def _read_payload():
    raw = sys.stdin.buffer.read()
    if not raw:
        return {}
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("utf-8", errors="replace").lstrip("\ufeff")
    return json.loads(text or "{}")


async def _send_and_close(client, tx):
    try:
        try:
            response = await client.send_tx(tx_type=tx["tx_type"], tx_info=tx["tx_info"])
        except Exception as exc:
            raise RuntimeError(_public_error(exc)) from exc
        payload = _response_payload(response)
        response_error = _response_error(payload)
        if response_error:
            raise RuntimeError(response_error)
        return {**tx, "response": payload}
    finally:
        await client.close()


async def _main():
    try:
        import lighter
        from lighter.signer_client import CreateOrderTxReq, decode_and_free

        payload = _read_payload()
        action = str(payload.get("action") or "")

        if action == "check_client":
            client = _client(lighter, payload)
            try:
                error = client.check_client()
                if error:
                    raise RuntimeError(error)
                return {"ok": True}
            finally:
                await client.close()

        if action == "auth_token":
            client = _client(lighter, payload)
            try:
                token, error = client.create_auth_token_with_expiry(
                    deadline=int(payload.get("deadline") or 600),
                    api_key_index=int(payload["api_key_index"]),
                )
                if error:
                    raise RuntimeError(error)
                return {"ok": True, "auth_token": token}
            finally:
                await client.close()

        if action == "approve_integrator_prepare":
            client = _client(lighter, payload)
            try:
                if not hasattr(client, "signer"):
                    raise RuntimeError("Installed lighter-sdk does not expose low-level signer")
                result = client.signer.SignApproveIntegrator(
                    int(payload["integrator_account_index"]),
                    int(payload.get("max_perps_taker_fee") or 0),
                    int(payload.get("max_perps_maker_fee") or 0),
                    int(payload.get("max_spot_taker_fee") or 0),
                    int(payload.get("max_spot_maker_fee") or 0),
                    int(payload.get("approval_expiry") or -1),
                    int(payload.get("skip_nonce") or 0),
                    int(payload.get("nonce") or -1),
                    int(payload["api_key_index"]),
                    client.account_index,
                )
                err = decode_and_free(result.err)
                tx_info = decode_and_free(result.txInfo)
                tx_hash = decode_and_free(result.txHash)
                message = decode_and_free(result.messageToSign)
                if err:
                    raise RuntimeError(err)
                return {
                    "ok": True,
                    "tx_type": result.txType,
                    "tx_info": tx_info,
                    "tx_hash": tx_hash,
                    "message_to_sign": message,
                }
            finally:
                await client.close()

        if action == "send_tx":
            client = _client(lighter, payload)
            tx_info = payload["tx_info"]
            if payload.get("l1_signature"):
                parsed = json.loads(tx_info) if isinstance(tx_info, str) else dict(tx_info)
                parsed["L1Sig"] = str(payload["l1_signature"])
                tx_info = json.dumps(parsed, separators=(",", ":"))
            return await _send_and_close(client, {
                "tx_type": int(payload["tx_type"]),
                "tx_info": tx_info,
                "tx_hash": payload.get("tx_hash"),
            })

        client = _client(lighter, payload)
        if action == "create_grouped_orders":
            if not hasattr(client, "sign_create_grouped_orders"):
                raise RuntimeError("Installed lighter-sdk does not expose grouped order signing")
            raw_orders = payload.get("orders")
            if not isinstance(raw_orders, list) or not raw_orders:
                raise ValueError("orders are required")
            orders = []
            for raw in raw_orders:
                if not isinstance(raw, dict):
                    raise ValueError("each grouped order must be an object")
                orders.append(CreateOrderTxReq(
                    int(raw["market_index"]),
                    int(raw["client_order_index"]),
                    int(raw["base_amount"]),
                    int(raw["price"]),
                    1 if raw.get("is_ask") else 0,
                    int(raw["order_type"]),
                    int(raw["time_in_force"]),
                    1 if raw.get("reduce_only") else 0,
                    int(raw.get("trigger_price") or 0),
                    int(raw.get("order_expiry") if raw.get("order_expiry") is not None else -1),
                ))
            tx = _tx_tuple(client.sign_create_grouped_orders(
                int(payload["grouping_type"]),
                orders,
                integrator_account_index=int(payload.get("integrator_account_index") or 0),
                integrator_taker_fee=int(payload.get("integrator_taker_fee") or 0),
                integrator_maker_fee=int(payload.get("integrator_maker_fee") or 0),
                api_key_index=int(payload["api_key_index"]),
            ))
            return await _send_and_close(client, tx)

        if action == "create_order":
            tx = _tx_tuple(client.sign_create_order(
                int(payload["market_index"]),
                int(payload["client_order_index"]),
                int(payload["base_amount"]),
                int(payload["price"]),
                bool(payload["is_ask"]),
                int(payload["order_type"]),
                int(payload["time_in_force"]),
                bool(payload.get("reduce_only") or False),
                int(payload.get("trigger_price") or 0),
                int(payload.get("order_expiry") if payload.get("order_expiry") is not None else -1),
                integrator_account_index=int(payload.get("integrator_account_index") or 0),
                integrator_taker_fee=int(payload.get("integrator_taker_fee") or 0),
                integrator_maker_fee=int(payload.get("integrator_maker_fee") or 0),
                api_key_index=int(payload["api_key_index"]),
            ))
            return await _send_and_close(client, tx)

        if action == "cancel_order":
            tx = _tx_tuple(client.sign_cancel_order(
                int(payload["market_index"]),
                int(payload["order_index"]),
                api_key_index=int(payload["api_key_index"]),
            ))
            return await _send_and_close(client, tx)

        if action == "update_leverage":
            tx = _tx_tuple(client.sign_update_leverage(
                int(payload["market_index"]),
                int(payload["fraction"]),
                int(payload["margin_mode"]),
                api_key_index=int(payload["api_key_index"]),
            ))
            return await _send_and_close(client, tx)

        raise ValueError(f"Unsupported action: {action}")
    except Exception as exc:
        payload = {"ok": False, "error": str(exc)}
        if os.environ.get("LIGHTER_SIGNER_TRACE") == "1":
            payload["traceback"] = traceback.format_exc()
        return payload


if __name__ == "__main__":
    result = asyncio.run(_main())
    _reply(result, 0 if result.get("ok", True) else 1)
