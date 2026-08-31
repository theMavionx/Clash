import assert from 'node:assert/strict';
import {test} from 'node:test';
import {questRewardPending,syncQuestResources} from './src/lib/questRewardDelivery.js';

test('quest synchronization uses actual balances, not the promised earned amount',()=>{
 const messages=[],godot=[];
 const bridge={onGodotMessage:msg=>messages.push(msg),godotBridge:msg=>godot.push(JSON.parse(msg))};
 const balance={gold:9000,wood:9000,ore:9000};
 assert.equal(syncQuestResources(balance,bridge),true);
 assert.deepEqual(messages,[{action:'resources',data:balance}]);
 assert.deepEqual(godot,[{action:'set_resources',data:balance}]);
 assert.equal(syncQuestResources({wood:2},bridge),false);
 assert.equal(syncQuestResources({gold:NaN,wood:2,ore:3},bridge),false);
 assert.equal(syncQuestResources({gold:null,wood:2,ore:3},bridge),false);
 assert.equal(messages.length,1,'partial/error responses never wipe a balance');
});
test('pending reward presentation includes all three resources and hides missing/negative values',()=>{
 assert.deepEqual(questRewardPending({gold:8888,wood:8253,ore:7378}),{gold:8888,wood:8253,ore:7378});
 assert.deepEqual(questRewardPending({wood:-1,ore:'12'}),{gold:0,wood:0,ore:12});
 assert.deepEqual(questRewardPending(null),{gold:0,wood:0,ore:0});
});
