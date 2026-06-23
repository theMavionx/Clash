#!/usr/bin/env python3
import asyncio
import json
import sys


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


async def _send_and_close(client, tx):
    try:
        response = await client.send_tx(tx_type=tx["tx_type"], tx_info=tx["tx_info"])
        return {**tx, "response": _response_payload(response)}
    finally:
        await client.close()


async def _main():
    try:
        import lighter
        from lighter.signer_client import decode_and_free

        payload = json.loads(sys.stdin.read() or "{}")
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
                res = client.signer.SignApproveIntegrator(
                    int(payload["integrator_account_index"]),
                    int(payload.get("max_perps_taker_fee") or 0),
                    int(payload.get("max_perps_maker_fee") or 0),
                    int(payload.get("max_spot_taker_fee") or 0),
                    int(payload.get("max_spot_maker_fee") or 0),
                    int(payload.get("approval_expiry") or -1),
                    int(payload.get("skip_nonce") or 0),
                    int(payload.get("nonce") or -1),
                    int(payload["api_key_index"]),
                    int(payload["account_index"]),
                )
                err = decode_and_free(res.err)
                tx_info = decode_and_free(res.txInfo)
                tx_hash = decode_and_free(res.txHash)
                message = decode_and_free(res.messageToSign)
                if err:
                    raise RuntimeError(err)
                return {
                    "ok": True,
                    "tx_type": res.txType,
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
        return {"ok": False, "error": str(exc)}


if __name__ == "__main__":
    result = asyncio.run(_main())
    _reply(result, 0 if result.get("ok", True) else 1)
