import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  terminalToolGroupsForIntent,
  terminalToolGroupsSatisfied,
  responseClaimsActionSucceeded,
  classifyGameIntent,
} = require('../../server/hermes_client.js');
const {
  composeRuntimeInstructions,
  toolIncludeForDex,
} = require('../../hermes-orchestrator/src/clash_agent_prompt.cjs');

const cases = [
  {
    name: 'tp_sl_read_only_is_not_enough',
    intent: { kind: 'decibel_tpsl', action_required: true, expected_tools: ['decibel_get_positions', 'decibel_set_tpsl'] },
    response: 'TP 90000 and SL 82000 set for BTC.',
    usedTools: ['decibel_get_positions'],
    expectClaims: true,
    expectSatisfied: false,
  },
  {
    name: 'tp_sl_terminal_tool_satisfies',
    intent: { kind: 'decibel_tpsl', action_required: true, expected_tools: ['decibel_get_positions', 'decibel_set_tpsl'] },
    response: 'TP 90000 and SL 82000 set for BTC.',
    usedTools: ['decibel_get_positions', 'decibel_set_tpsl'],
    expectClaims: true,
    expectSatisfied: true,
  },
  {
    name: 'leverage_read_only_is_not_enough',
    intent: { kind: 'decibel_leverage', action_required: true, expected_tools: ['decibel_get_positions', 'decibel_set_leverage'] },
    response: 'DOGE leverage set to 20x successfully.',
    usedTools: ['decibel_get_positions'],
    expectClaims: true,
    expectSatisfied: false,
  },
  {
    name: 'cancel_read_only_is_not_enough',
    intent: { kind: 'decibel_cancel_order', action_required: true, expected_tools: ['decibel_get_positions', 'decibel_cancel_order'] },
    response: 'Cancelled order 123 on ETH.',
    usedTools: ['decibel_get_positions'],
    expectClaims: true,
    expectSatisfied: false,
  },
  {
    name: 'clarification_does_not_claim_success',
    intent: { kind: 'decibel_place_order', action_required: true, expected_tools: ['decibel_place_order'] },
    response: 'Уточни монету і суму для лонгу.',
    usedTools: [],
    expectClaims: false,
    expectSatisfied: false,
  },
  {
    name: 'shield_blocker_does_not_claim_success',
    intent: { kind: 'targeted_battle', action_required: true, expected_tools: ['get_base_state', 'execute_ai_attack_plan'] },
    response: 'decitoshi ще під щитом приблизно 4 години, зараз атакувати не можна.',
    usedTools: ['get_base_state'],
    expectClaims: false,
    expectSatisfied: false,
  },
  {
    name: 'upgrade_troop_alternative_satisfies',
    intent: { kind: 'upgrade', action_required: true, expected_tools: ['get_base_state', 'upgrade_building', 'upgrade_troop'] },
    response: 'Knight upgraded to level 2.',
    usedTools: ['get_base_state', 'upgrade_troop'],
    expectClaims: true,
    expectSatisfied: true,
  },
  {
    name: 'upgrade_read_only_is_not_enough',
    intent: { kind: 'upgrade', action_required: true, expected_tools: ['get_base_state', 'upgrade_building', 'upgrade_troop'] },
    response: 'Knight upgraded to level 2.',
    usedTools: ['get_base_state'],
    expectClaims: true,
    expectSatisfied: false,
  },
  {
    name: 'resource_collect_requires_collect_tool',
    intent: { kind: 'collect_resources', action_required: true, expected_tools: ['get_base_state', 'collect_resources'] },
    response: 'Collected all available resources.',
    usedTools: ['get_base_state'],
    expectClaims: true,
    expectSatisfied: false,
  },
  {
    name: 'avantis_tpsl_read_only_is_not_enough',
    intent: { kind: 'avantis_tpsl', action_required: true, expected_tools: ['avantis_get_positions', 'avantis_set_tpsl'] },
    response: 'TP and SL updated on the BTC Avantis position.',
    usedTools: ['avantis_get_positions'],
    expectClaims: true,
    expectSatisfied: false,
  },
  {
    name: 'avantis_place_order_terminal_tool_satisfies',
    intent: { kind: 'avantis_place_order', action_required: true, expected_tools: ['avantis_place_order'] },
    response: 'Avantis BTC long is prepared; check your browser wallet to submit it.',
    usedTools: ['avantis_place_order'],
    expectClaims: false,
    expectSatisfied: true,
  },
  {
    name: 'avantis_minimum_size_blocker_does_not_claim_success',
    intent: { kind: 'avantis_place_order', action_required: true, expected_tools: ['avantis_place_order'] },
    response: "The short SOL order can’t be placed because the notional would be below Avantis’s minimum position size. Increase the amount before trying again.",
    usedTools: ['avantis_place_order'],
    expectClaims: false,
    expectSatisfied: true,
  },
];

const rows = cases.map((test) => {
  const groups = terminalToolGroupsForIntent(test.intent);
  const claims = responseClaimsActionSucceeded(test.response, test.intent);
  const satisfied = terminalToolGroupsSatisfied(test.usedTools, groups);
  return {
    name: test.name,
    ok: claims === test.expectClaims && satisfied === test.expectSatisfied,
    groups,
    claims,
    satisfied,
    expected: {
      claims: test.expectClaims,
      satisfied: test.expectSatisfied,
    },
  };
});

const avantisRuntime = composeRuntimeInstructions('avantis');
const ukSolShortMaxAll = '\u0432\u0456\u0434\u043a\u0440\u0438\u0439 \u043f\u043e \u0441\u043e\u043b\u0430\u043d\u0430 \u0448\u043e\u0440\u0442 \u043c\u0430\u043a\u0441\u0438\u043c\u0430\u043b\u044c\u043d\u043e \u0434\u043e\u0432\u0437\u043e\u043b\u0435\u043d\u0435 \u043f\u043b\u0435\u0447\u0435 \u0456 \u043d\u0430 \u0432\u0441\u0456 \u0433\u0440\u043e\u0448\u0456';
const ukAnyTrade = '\u0432\u0456\u0434\u043a\u0440\u0438\u0439 \u044f\u043a\u0443\u0441\u044c \u0443\u0433\u043e\u0434\u0443 25 \u043f\u043b\u0435\u0447\u0435 \u043c\u0430\u043a\u0441\u0438\u043c\u0443\u043c \u043d\u0430 \u0432\u0441\u0456 \u0433\u0440\u043e\u0448\u0456';
const ukTpProfit20 = '\u043f\u043e\u0441\u0442\u0430\u0432 \u0442\u043f \u043d\u0430 20% \u043f\u0440\u0438\u0431\u0443\u0442\u043a\u0443';
const ukAnyTradeIntent = classifyGameIntent(ukAnyTrade, { dex: 'avantis' });
const ukTpProfitIntent = classifyGameIntent(ukTpProfit20, { dex: 'avantis' });
const volatileIntent = classifyGameIntent('open something more volatile than BTC on Avantis', { dex: 'avantis' });
const compoundIntent = classifyGameIntent('close BTC and open something more volatile on Avantis', { dex: 'avantis' });
const dexScopeRows = [
  {
    name: 'avantis_runtime_excludes_decibel_tools',
    ok: !avantisRuntime.includes('decibel_place_order') && avantisRuntime.includes('avantis_place_order') && avantisRuntime.includes('avantis_market_scan'),
  },
  {
    name: 'avantis_tool_allowlist_excludes_decibel_tools',
    ok: !toolIncludeForDex('avantis').some((tool) => String(tool).startsWith('decibel_'))
      && toolIncludeForDex('avantis').includes('avantis_place_order')
      && toolIncludeForDex('avantis').includes('avantis_market_scan'),
  },
  {
    name: 'ukrainian_avantis_sol_short_max_all_routes_to_place_order',
    ok: classifyGameIntent(ukSolShortMaxAll, { dex: 'avantis' }).kind === 'avantis_place_order',
  },
  {
    name: 'ukrainian_avantis_delegated_trade_requires_market_scan_then_place',
    ok: ukAnyTradeIntent.kind === 'avantis_place_order'
      && ukAnyTradeIntent.delegated_choice === true
      && ukAnyTradeIntent.expected_tools?.[0] === 'avantis_market_scan'
      && ukAnyTradeIntent.expected_tools?.[1] === 'avantis_place_order',
  },
  {
    name: 'ukrainian_cyrillic_tp_profit_routes_to_avantis_tpsl_not_build',
    ok: ukTpProfitIntent.kind === 'avantis_tpsl'
      && terminalToolGroupsForIntent(ukTpProfitIntent).some((group) => group.includes('avantis_set_tpsl')),
  },
  {
    name: 'avantis_volatile_trade_is_delegated_scan',
    ok: volatileIntent.kind === 'avantis_place_order'
      && volatileIntent.delegated_choice === true
      && volatileIntent.expected_tools?.[0] === 'avantis_market_scan'
      && volatileIntent.expected_tools?.[1] === 'avantis_place_order',
  },
  {
    name: 'avantis_close_then_open_requires_both_terminal_tools',
    ok: compoundIntent.kind === 'avantis_close_then_place_order'
      && terminalToolGroupsForIntent(compoundIntent).some((group) => group.includes('avantis_close_position'))
      && terminalToolGroupsForIntent(compoundIntent).some((group) => group.includes('avantis_place_order')),
  },
];

const allRows = [...rows, ...dexScopeRows];
const failures = allRows.filter((row) => !row.ok);
console.log(JSON.stringify({
  ok: failures.length === 0,
  total: allRows.length,
  passed: allRows.length - failures.length,
  failed: failures.length,
  failures,
  rows: allRows,
}, null, 2));

if (failures.length) process.exit(1);
