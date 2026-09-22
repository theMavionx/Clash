"""Native SDK signing only: never calls send_tx or a funded account."""
import asyncio
import json
import unittest
import lighter
import lighter_signer as bridge


class NativeSignerTests(unittest.TestCase):
    def test_explicit_nonce_and_proxy_for_trading_actions(self):
        private_key, _, error = lighter.SignerClient.create_api_key(None)
        self.assertIsNone(error)
        base = dict(api_url="https://mainnet.zklighter.elliot.ai", account_index=42,
                    api_key_index=4, api_private_key=private_key, nonce=0,
                    proxy_url="http://test:test@127.0.0.1:9")

        async def never_send(client, tx):
            self.assertEqual(client.api_client.configuration.proxy, base['proxy_url'])
            self.assertEqual(client.api_client.rest_client.proxy, base['proxy_url'])
            wire = json.loads(tx['tx_info'])
            self.assertEqual(wire['Nonce'], 0)
            self.assertEqual(wire['AccountIndex'], 42)
            self.assertEqual(wire['ApiKeyIndex'], 4)
            await client.close()
            return {'ok': True}

        original_send, original_read = bridge._send_and_close, bridge._read_payload
        bridge._send_and_close = never_send
        try:
            cases = [
                dict(action='create_order', market_index=0, client_order_index=123,
                     base_amount=100, price=8000000, is_ask=False, order_type=0,
                     time_in_force=1, order_expiry=-1),
                dict(action='cancel_order', market_index=0, order_index=123),
                dict(action='update_leverage', market_index=0, fraction=1000, margin_mode=0),
                dict(action='create_grouped_orders', grouping_type=2, orders=[
                    dict(market_index=0, client_order_index=124, base_amount=100,
                         price=8100000, is_ask=True, order_type=4, time_in_force=0,
                         reduce_only=True, trigger_price=8100000, order_expiry=-1),
                    dict(market_index=0, client_order_index=125, base_amount=100,
                         price=7900000, is_ask=True, order_type=2, time_in_force=0,
                         reduce_only=True, trigger_price=7900000, order_expiry=-1)]),
            ]
            for case in cases:
                bridge._read_payload = lambda: {**base, **case}
                result = asyncio.run(bridge._main())
                self.assertTrue(result.get('ok'), f"{case['action']}: {result.get('error')}")
        finally:
            bridge._send_and_close, bridge._read_payload = original_send, original_read


if __name__ == '__main__':
    unittest.main()
