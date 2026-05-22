import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://lnesemdbowelyzzxeayl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxuZXNlbWRib3dlbHl6enhlYXlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMDM2MTEsImV4cCI6MjA5MjY3OTYxMX0.C1BNLH9Ty6h6PvMdVbEWXuIbjyP6p9nhdvx8ZUsV8x4';

async function testCollaboration() {
  console.log('\n================================================================');
  console.log('STARTING REAL-TIME COLLABORATION Live WebSocket Integration Test');
  console.log('================================================================\n');

  // Initialize clients
  const clientA = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });
  const clientB = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const emailA = 'collab_tester_a@example.com';
  const emailB = 'collab_tester_b@example.com';
  const password = 'TestPassword123!';

  console.log('Logging in User A...');
  const { data: authA, error: errA } = await clientA.auth.signInWithPassword({ email: emailA, password });
  if (errA) throw new Error(`User A login failed: ${errA.message}`);
  const userA = authA.user;
  console.log(`User A logged in successfully. ID: ${userA.id}`);

  console.log('Logging in User B...');
  const { data: authB, error: errB } = await clientB.auth.signInWithPassword({ email: emailB, password });
  if (errB) throw new Error(`User B login failed: ${errB.message}`);
  const userB = authB.user;
  console.log(`User B logged in successfully. ID: ${userB.id}`);

  // Create temporary space
  console.log('\n[Database] Creating temporary private space using User A...');
  const { data: space, error: spaceErr } = await clientA
    .from('spaces')
    .insert({
      title: `Integration Collab Space - ${Date.now()}`,
      owner_id: userA.id,
      visibility: 'private',
      status: 'ready'
    })
    .select()
    .single();

  if (spaceErr) throw new Error(`Failed to create space: ${spaceErr.message}`);
  console.log(`Space created successfully. Space ID: ${space.id}`);

  // Add owner to space_collaborators
  console.log('[Database] Registering owner as space collaborator...');
  const { error: collAErr } = await clientA
    .from('space_collaborators')
    .insert({
      space_id: space.id,
      user_id: userA.id,
      role: 'owner'
    });
  if (collAErr) throw new Error(`Failed to register owner: ${collAErr.message}`);

  // Invite User B as Editor
  console.log('[Database] Inviting User B as editor...');
  const { error: inviteErr } = await clientA
    .from('space_invites')
    .insert({
      space_id: space.id,
      sender_id: userA.id,
      receiver_id: userB.id,
      receiver_email: emailB,
      role: 'editor',
      status: 'accepted'
    });
  if (inviteErr) throw new Error(`Failed to invite User B: ${inviteErr.message}`);

  // Add User B to space_collaborators (done by User A since they own the space)
  console.log('[Database] Adding User B as collaborator (performed by Space Owner User A)...');
  const { error: collBErr } = await clientA
    .from('space_collaborators')
    .insert({
      space_id: space.id,
      user_id: userB.id,
      role: 'editor'
    });
  if (collBErr) throw new Error(`Failed to register User B: ${collBErr.message}`);
  console.log('Database relationships established successfully.');

  // Subscribe to Realtime channel
  console.log('\n[WebSocket] Establishing Realtime WebSocket connections for both users...');
  
  const channelA = clientA.channel(`space:${space.id}`, {
    config: {
      presence: { key: userA.id },
      broadcast: { self: false }
    }
  });

  const channelB = clientB.channel(`space:${space.id}`, {
    config: {
      presence: { key: userB.id },
      broadcast: { self: false }
    }
  });

  // Test states
  let userBReceivedPresence = null;
  let userBReceivedOps = null;
  let userAReceivedPresence = null;
  let userAReceivedOps = null;

  // Listeners for User B
  channelB
    .on('broadcast', { event: 'cursor-presence' }, (msg) => {
      console.log('--> User B received "cursor-presence" broadcast!');
      userBReceivedPresence = msg.payload;
    })
    .on('broadcast', { event: 'doc-ops' }, (msg) => {
      console.log('--> User B received "doc-ops" broadcast!');
      userBReceivedOps = msg.payload;
    });

  // Listeners for User A
  channelA
    .on('broadcast', { event: 'cursor-presence' }, (msg) => {
      console.log('--> User A received "cursor-presence" broadcast!');
      userAReceivedPresence = msg.payload;
    })
    .on('broadcast', { event: 'doc-ops' }, (msg) => {
      console.log('--> User A received "doc-ops" broadcast!');
      userAReceivedOps = msg.payload;
    });

  // Subscribe User A
  const subAPromise = new Promise((resolve) => {
    channelA.subscribe((status) => {
      console.log(`User A channel status: ${status}`);
      if (status === 'SUBSCRIBED') resolve();
    });
  });

  // Subscribe User B
  const subBPromise = new Promise((resolve) => {
    channelB.subscribe((status) => {
      console.log(`User B channel status: ${status}`);
      if (status === 'SUBSCRIBED') resolve();
    });
  });

  await Promise.all([subAPromise, subBPromise]);
  console.log('Both WebSocket connections successfully established.');

  // Let channels settle
  await new Promise(r => setTimeout(r, 1000));

  // --- TEST CASE 1: Cursor presence broadcast from User A to User B ---
  console.log('\n[Test 1] Broadcasting cursor presence from User A to User B...');
  const payloadCursorA = {
    user_id: userA.id,
    file_path: 'Welcome.md',
    cursor: { from: 10, to: 20 },
    name: 'Tester A',
    color: '#3b82f6'
  };

  await channelA.send({
    type: 'broadcast',
    event: 'cursor-presence',
    payload: payloadCursorA
  });

  // Wait for delivery
  await new Promise(r => setTimeout(r, 800));

  if (userBReceivedPresence) {
    console.log('SUCCESS: User B received User A\'s cursor presence!');
    console.log('Payload:', JSON.stringify(userBReceivedPresence));
  } else {
    console.error('FAILURE: User B did not receive User A\'s cursor presence.');
  }

  // --- TEST CASE 2: Editing operations broadcast from User A to User B ---
  console.log('\n[Test 2] Broadcasting document edits (ops) from User A to User B...');
  const payloadOpsA = {
    path: 'Welcome.md',
    ops: [
      {
        from: 0,
        to: 0,
        insert: 'Dynamic collaborative text edit. ',
        timestamp: Date.now(),
        clientId: 'client-A-1234',
        userId: userA.id
      }
    ],
    clientId: 'client-A-1234'
  };

  await channelA.send({
    type: 'broadcast',
    event: 'doc-ops',
    payload: payloadOpsA
  });

  // Wait for delivery
  await new Promise(r => setTimeout(r, 800));

  if (userBReceivedOps) {
    console.log('SUCCESS: User B received User A\'s document operations!');
    console.log('Payload:', JSON.stringify(userBReceivedOps));
  } else {
    console.error('FAILURE: User B did not receive User A\'s document operations.');
  }

  // --- TEST CASE 3: Bidirectional communication (B to A) ---
  console.log('\n[Test 3] Broadcasting cursor presence and ops back from User B to User A...');
  const payloadCursorB = {
    user_id: userB.id,
    file_path: 'Welcome.md',
    cursor: { from: 50, to: 50 },
    name: 'Tester B',
    color: '#10b981'
  };

  const payloadOpsB = {
    path: 'Welcome.md',
    ops: [
      {
        from: 10,
        to: 10,
        insert: 'Another live edit here.',
        timestamp: Date.now(),
        clientId: 'client-B-5678',
        userId: userB.id
      }
    ],
    clientId: 'client-B-5678'
  };

  await channelB.send({
    type: 'broadcast',
    event: 'cursor-presence',
    payload: payloadCursorB
  });

  await channelB.send({
    type: 'broadcast',
    event: 'doc-ops',
    payload: payloadOpsB
  });

  // Wait for delivery
  await new Promise(r => setTimeout(r, 800));

  if (userAReceivedPresence && userAReceivedOps) {
    console.log('SUCCESS: Bidirectional sync working! User A received User B\'s cursor & operations.');
    console.log('Cursor Payload:', JSON.stringify(userAReceivedPresence));
    console.log('Ops Payload:', JSON.stringify(userAReceivedOps));
  } else {
    console.error('FAILURE: Bidirectional sync failed.');
  }

  // Clean up
  console.log('\n[Cleanup] Cleaning up resources...');
  await channelA.unsubscribe();
  await channelB.unsubscribe();

  // Delete collaborator rows
  await clientA.from('space_collaborators').delete().eq('space_id', space.id);
  await clientA.from('space_invites').delete().eq('space_id', space.id);
  
  // Delete the temporary space
  const { error: deleteErr } = await clientA.from('spaces').delete().eq('id', space.id);
  if (deleteErr) {
    console.error(`Failed to delete temporary space: ${deleteErr.message}`);
  } else {
    console.log('Temporary space and collaboration tables successfully cleaned.');
  }

  console.log('\n================================================================');
  console.log('REAL-TIME COLLABORATION Live WebSocket Integration Test COMPLETE');
  console.log('================================================================\n');
}

testCollaboration().catch(err => {
  console.error('\nUNEXPECTED FAILURE DURING INTEGRATION TEST:', err);
});
