// Every destination ClashBot's production runtime executes, with the in-game
// step that hands ClashBot a trade-only connection for it. Each connector
// returns { destinationAccount, credential, ownerWallet? } for provision and
// reports progress through `onStage(id)` with the step ids in ./steps.js.
import { GAME_COPY_DESTINATIONS, defaultDestinationAccount, obtainTradeOnlyCredential } from '../copyConnections';
import * as arcus from './arcus';
import * as decibel from './decibel';
import * as gmx from './gmx';
import * as grvt from './grvt';
import * as lighter from './lighter';
import * as ondo from './ondo';
import * as phoenix from './phoenix';
import * as qfex from './qfex';

function gameConnection(venue) {
  const info = GAME_COPY_DESTINATIONS[venue];
  return {
    chain: info.chain,
    label: info.authorize,
    async connect({ player, walletCtx, onProgress, onStage }) {
      onStage?.('wallet');
      const owner = defaultDestinationAccount(venue, player, walletCtx);
      if (!owner) throw new Error(info.chain === 'solana' ? 'Connect your Solana wallet in the game first.' : 'Connect your EVM wallet in the game first.');
      return { destinationAccount: owner, credential: await obtainTradeOnlyCredential({ venue, owner, walletCtx, onProgress, onStage }) };
    },
  };
}

function venueModule(module, venue) {
  return {
    chain: module.requirements.chain,
    label: module.requirements.label,
    connect: (ctx) => module.connect({ ...ctx, venue }),
  };
}

/** Display order of destinations in the setup flow. */
export const COPY_CONNECTORS = {
  hyperliquid: gameConnection('hyperliquid'),
  lighter: venueModule(lighter, 'lighter'),
  rhlighter: venueModule(lighter, 'rhlighter'),
  decibel: venueModule(decibel, 'decibel'),
  nado: gameConnection('nado'),
  risex: gameConnection('risex'),
  grvt: venueModule(grvt, 'grvt'),
  gmx: venueModule(gmx, 'gmx'),
  phoenix: venueModule(phoenix, 'phoenix'),
  bulk: gameConnection('bulk'),
  ondo: venueModule(ondo, 'ondo'),
  arcus: venueModule(arcus, 'arcus'),
  qfex: venueModule(qfex, 'qfex'),
};

export const COPY_DESTINATION_IDS = Object.keys(COPY_CONNECTORS);
