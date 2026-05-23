import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://lnesemdbowelyzzxeayl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxuZXNlbWRib3dlbHl6enhlYXlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMDM2MTEsImV4cCI6MjA5MjY3OTYxMX0.C1BNLH9Ty6h6PvMdVbEWXuIbjyP6p9nhdvx8ZUsV8x4';

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.error(`  FAIL: ${label}`);
    failed++;
  }
}

async function testCollaboration() {
  console.log('\n================================================================');
  console.log('REAL-TIME COLLABORATION Integration Test (v2 -- with doc-full)');
  console.log('================================================================\n');

  const clientA = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const clientB = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  const password = 'TestPassword123!';

  const { data: authA, error: errA } = await clientA.auth.signInWithPassword({ email: 'collab_tester_a@example.com', password });
  if (errA) throw new Error(`User A login failed: ${errA.message}`);
  const userA = authA.user;
  console.log(`User A logged in. ID: ${userA.id}`);

  const { data: authB, error: errB } = await clientB.auth.signInWithPassword({ email: 'collab_tester_b@example.com', password });
  if (errB) throw new Error(`User B login failed: ${errB.message}`);
  const userB = authB.user;
  console.log(`User B logged in. ID: ${userB.id}`);

  // Create temporary space
  const { data: space, error: spaceErr } = await clientA
    .from('spaces')
    .insert({ title: `Test Space v2 - ${Date.now()}`, owner_id: userA.id, visibility: 'private', status: 'ready' })
    .select().single();
  if (spaceErr) throw new Error(`Failed to create space: ${spaceErr.message}`);
  console.log(`Space created: ${space.id}`);

  await clientA.from('space_collaborators').insert({ space_id: space.id, user_id: userA.id, role: 'owner' });
  await clientA.from('space_collaborators').insert({ space_id: space.id, user_id: userB.id, role: 'editor' });

  // Subscribe
  const channelA = clientA.channel(`space:${space.id}`, { config: { presence: { key: userA.id }, broadcast: { self: false } } });
  const channelB = clientB.channel(`space:${space.id}`, { config: { presence: { key: userB.id }, broadcast: { self: false } } });

  let bReceivedPresence = null;
  let bReceivedOps = null;
  let bReceivedDocFull = null;
  let aReceivedPresence = null;
  let aReceivedOps = null;
  let aReceivedDocFull = null;

  channelB
    .on('broadcast', { event: 'cursor-presence' }, (msg) => { bReceivedPresence = msg.payload; })
    .on('broadcast', { event: 'doc-ops' }, (msg) => { bReceivedOps = msg.payload; })
    .on('broadcast', { event: 'doc-full' }, (msg) => { bReceivedDocFull = msg.payload; });

  channelA
    .on('broadcast', { event: 'cursor-presence' }, (msg) => { aReceivedPresence = msg.payload; })
    .on('broadcast', { event: 'doc-ops' }, (msg) => { aReceivedOps = msg.payload; })
    .on('broadcast', { event: 'doc-full' }, (msg) => { aReceivedDocFull = msg.payload; });

  const subA = new Promise(r => channelA.subscribe(s => { if (s === 'SUBSCRIBED') r(); }));
  const subB = new Promise(r => channelB.subscribe(s => { if (s === 'SUBSCRIBED') r(); }));
  await Promise.all([subA, subB]);
  console.log('Both channels subscribed.\n');
  await new Promise(r => setTimeout(r, 800));

  // ── Test 1: Cursor presence A -> B ──
  console.log('[Test 1] Cursor presence A -> B');
  await channelA.send({ type: 'broadcast', event: 'cursor-presence', payload: {
    user_id: userA.id, file_path: 'Welcome.md', cursor: { from: 10, to: 20 }, name: 'Tester A', color: '#3b82f6'
  }});
  await new Promise(r => setTimeout(r, 600));
  assert('User B received cursor presence from A', !!bReceivedPresence);
  assert('Cursor data matches', bReceivedPresence?.cursor?.from === 10 && bReceivedPresence?.cursor?.to === 20);

  // ── Test 2: Granular ops A -> B ──
  console.log('[Test 2] Granular doc-ops A -> B');
  await channelA.send({ type: 'broadcast', event: 'doc-ops', payload: {
    path: 'Welcome.md',
    ops: [{ type: 'insert', from: 0, text: 'Hello ', timestamp: Date.now(), clientId: 'cA', user_id: userA.id }],
    clientId: 'cA'
  }});
  await new Promise(r => setTimeout(r, 600));
  assert('User B received doc-ops from A', !!bReceivedOps);
  assert('Op text matches', bReceivedOps?.ops?.[0]?.text === 'Hello ');

  // ── Test 3: doc-full (large edit fallback) A -> B ──
  console.log('[Test 3] Full-document broadcast (doc-full) A -> B');
  const largeContent = 'x'.repeat(1000);
  await channelA.send({ type: 'broadcast', event: 'doc-full', payload: {
    path: 'Welcome.md', content: largeContent, clientId: 'cA'
  }});
  await new Promise(r => setTimeout(r, 600));
  assert('User B received doc-full from A', !!bReceivedDocFull);
  assert('Full content matches (1000 chars)', bReceivedDocFull?.content?.length === 1000);

  // ── Test 4: Bidirectional cursor B -> A ──
  console.log('[Test 4] Bidirectional cursor B -> A');
  await channelB.send({ type: 'broadcast', event: 'cursor-presence', payload: {
    user_id: userB.id, file_path: 'Welcome.md', cursor: { from: 50, to: 55 }, name: 'Tester B', color: '#10b981'
  }});
  await new Promise(r => setTimeout(r, 600));
  assert('User A received cursor presence from B', !!aReceivedPresence);
  assert('Cursor B data matches', aReceivedPresence?.cursor?.from === 50);

  // ── Test 5: Bidirectional doc-ops B -> A ──
  console.log('[Test 5] Bidirectional doc-ops B -> A');
  await channelB.send({ type: 'broadcast', event: 'doc-ops', payload: {
    path: 'Welcome.md',
    ops: [{ type: 'insert', from: 5, text: 'World', timestamp: Date.now(), clientId: 'cB', user_id: userB.id }],
    clientId: 'cB'
  }});
  await new Promise(r => setTimeout(r, 600));
  assert('User A received doc-ops from B', !!aReceivedOps);

  // ── Test 6: Bidirectional doc-full B -> A ──
  console.log('[Test 6] Bidirectional doc-full B -> A');
  await channelB.send({ type: 'broadcast', event: 'doc-full', payload: {
    path: 'Welcome.md', content: 'Full replacement from B', clientId: 'cB'
  }});
  await new Promise(r => setTimeout(r, 600));
  assert('User A received doc-full from B', !!aReceivedDocFull);
  assert('Content matches', aReceivedDocFull?.content === 'Full replacement from B');

  // Cleanup
  console.log('\n[Cleanup]');
  await channelA.unsubscribe();
  await channelB.unsubscribe();
  await clientA.from('space_collaborators').delete().eq('space_id', space.id);
  await clientA.from('spaces').delete().eq('id', space.id);
  console.log('Cleaned up.');

  console.log(`\n================================================================`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
  console.log(`================================================================\n`);

  if (failed > 0) process.exit(1);
}

testCollaboration().catch(err => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
