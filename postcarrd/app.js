// ── Supabase init ──
const SUPABASE_URL = 'https://yiyeiccylyspbaaglnhp.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpeWVpY2N5bHlzcGJhYWdsbmhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMzM0NjgsImV4cCI6MjA5NzkwOTQ2OH0.SAIlH25STP0o3TQVxN31V_MBEbvunvFTbCqynGy9BD4';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

let currentUser = null;
let currentPhoto = null;
let envelopeOpened = false;

// ── boot ──
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentUser = session.user;
    showApp();
  } else {
    goTo('screen-auth');
  }
})();

sb.auth.onAuthStateChange((_e, session) => {
  currentUser = session?.user ?? null;
  if (currentUser) showApp();
});

function showApp() {
  document.getElementById('topnav').style.display = 'flex';
  const name = currentUser.user_metadata?.display_name || currentUser.email;
  document.getElementById('nav-user').textContent = name;
  goTo('screen-landing');
}

// ── navigation ──
function goTo(id) {
  document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  if (id !== 'screen-envelope') envelopeOpened = false;
  if (id === 'screen-inbox') loadInbox();
}

// ── auth tabs ──
function switchAuthTab(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
  document.getElementById('field-name').style.display = tab === 'signup' ? 'flex' : 'none';
  document.getElementById('auth-btn').textContent = tab === 'login' ? 'Sign in' : 'Create account';
  document.getElementById('auth-btn').dataset.mode = tab;
  document.getElementById('auth-error').classList.add('hidden');
}
document.getElementById('auth-btn').dataset.mode = 'login';

// ── auth handler ──
async function handleAuth() {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const mode     = document.getElementById('auth-btn').dataset.mode;
  const errEl    = document.getElementById('auth-error');
  const btn      = document.getElementById('auth-btn');
  errEl.classList.add('hidden');

  if (!email || !password) { showErr(errEl, 'Please fill in email and password.'); return; }
  if (password.length < 6)  { showErr(errEl, 'Password must be at least 6 characters.'); return; }

  btn.textContent = 'Please wait…';
  btn.disabled = true;

  try {
    if (mode === 'signup') {
      const name = document.getElementById('auth-name').value.trim();
      if (!name) { showErr(errEl, 'Please enter your display name.'); btn.textContent='Create account'; btn.disabled=false; return; }

      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { display_name: name } }
      });

      if (error) {
        showErr(errEl, error.message);
        btn.textContent = 'Create account';
        btn.disabled = false;
        return;
      }

      // insert profile manually (trigger may not fire instantly)
      if (data?.user) {
        await sb.from('profiles').upsert({
          id: data.user.id,
          email: data.user.email,
          display_name: name
        }, { onConflict: 'id' });
      }

      if (data?.session) {
        // logged in immediately — confirm email is truly off
        btn.textContent = 'Create account';
        btn.disabled = false;
        return;
      }

      // session is null — means email confirm is STILL on in Supabase
      // auto sign them in instead
      const { data: signInData, error: signInErr } = await sb.auth.signInWithPassword({ email, password });
      if (signInErr) {
        showErr(errEl, '✅ Account created! Now click "Sign in" tab and log in with your email and password.');
        btn.textContent = 'Create account';
        btn.disabled = false;
        return;
      }

    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        showErr(errEl, error.message === 'Invalid login credentials'
          ? 'Wrong email or password. If you just signed up, try again — or create an account first.'
          : error.message);
        btn.textContent = 'Sign in';
        btn.disabled = false;
        return;
      }
    }
  } catch (e) {
    showErr(errEl, 'Something went wrong: ' + e.message);
  }

  btn.textContent = mode === 'login' ? 'Sign in' : 'Create account';
  btn.disabled = false;
}

function showErr(el, msg, color = 'red') {
  el.textContent = msg;
  el.style.color = color === 'green' ? '#1D9E75' : '#c0392b';
  el.classList.remove('hidden');
}

// ── sign out ──
async function signOut() {
  await sb.auth.signOut();
  currentUser = null;
  document.getElementById('topnav').style.display = 'none';
  goTo('screen-auth');
}

// ── photo upload ──
function handlePhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    currentPhoto = ev.target.result;
    const img = document.getElementById('front-photo');
    img.src = currentPhoto;
    img.style.display = 'block';
    document.getElementById('upload-hint').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

// ── send card ──
async function sendCard() {
  const message = document.getElementById('message-text').value.trim();
  const addr1   = document.getElementById('addr1').value.trim();
  const addr2   = document.getElementById('addr2').value.trim();
  const addr3   = document.getElementById('addr3').value.trim();
  const addr4   = document.getElementById('addr4').value.trim();
  const toEmail = document.getElementById('to-email').value.trim();
  const errEl   = document.getElementById('send-error');
  errEl.classList.add('hidden');

  if (!currentPhoto) { showErr(errEl, 'Please add a cover photo.'); return; }
  if (!message)      { showErr(errEl, 'Please write a message.'); return; }
  if (!toEmail)      { showErr(errEl, 'Please enter the recipient\'s email.'); return; }

  const btn = document.getElementById('send-btn');
  btn.textContent = 'Sending…';
  btn.disabled = true;

  const { data: profiles, error: profileErr } = await sb
    .from('profiles').select('id, display_name').eq('email', toEmail).limit(1);

  if (profileErr || !profiles || profiles.length === 0) {
    showErr(errEl, `No account found for "${toEmail}". They need to sign up on this site first.`);
    btn.textContent = 'Seal & send ✉';
    btn.disabled = false;
    return;
  }

  const recipient  = profiles[0];
  const senderName = currentUser.user_metadata?.display_name || currentUser.email;

  const { error: insertErr } = await sb.from('postcards').insert({
    sender_id:    currentUser.id,
    sender_name:  senderName,
    recipient_id: recipient.id,
    message,
    photo_data:   currentPhoto,
    address:      [addr1, addr2, addr3, addr4].filter(Boolean),
    opened:       false,
  });

  btn.textContent = 'Seal & send ✉';
  btn.disabled = false;

  if (insertErr) { showErr(errEl, 'Error sending: ' + insertErr.message); return; }

  currentPhoto = null;
  document.getElementById('front-photo').src = '';
  document.getElementById('front-photo').style.display = 'none';
  document.getElementById('upload-hint').style.display = '';
  ['message-text','addr1','addr2','addr3','addr4','to-email'].forEach(id => {
    document.getElementById(id).value = '';
  });

  alert(`✉ Postcard sent to ${recipient.display_name || toEmail}!`);
  goTo('screen-inbox');
}

// ── inbox ──
async function loadInbox() {
  if (!currentUser) return;
  const list  = document.getElementById('inbox-list');
  const badge = document.getElementById('inbox-count');
  list.innerHTML = '<p style="color:#888;font-family:\'Special Elite\',serif;padding:1rem 0">Loading…</p>';

  const { data: cards, error } = await sb
    .from('postcards').select('*')
    .eq('recipient_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (error) { list.innerHTML = `<p style="color:red">Error: ${error.message}</p>`; return; }

  const unopened = (cards || []).filter(c => !c.opened).length;
  badge.textContent = unopened > 0 ? `${unopened} new` : 'all read';

  if (!cards || cards.length === 0) {
    list.innerHTML = '<p style="color:#888;font-family:\'Special Elite\',serif;padding:1rem 0">No postcards yet — ask a friend to send you one!</p>';
    return;
  }

  list.innerHTML = cards.map(card => {
    const initials = (card.sender_name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    const preview  = (card.message||'').slice(0,60) + ((card.message||'').length>60?'…':'');
    const dot      = card.opened ? '' : '<div class="inbox-new-dot"></div>';
    const time     = new Date(card.created_at).toLocaleDateString();
    return `<div class="inbox-item" onclick="openCard('${card.id}')">
      <div class="inbox-avatar">${initials}</div>
      <div class="inbox-meta">
        <div class="inbox-from">From ${card.sender_name||'Someone'}</div>
        <div class="inbox-preview">${preview}</div>
        <div style="font-size:0.75rem;color:#aaa;margin-top:3px">${time}</div>
      </div>${dot}</div>`;
  }).join('');
}

// ── open card ──
async function openCard(id) {
  const { data: card, error } = await sb.from('postcards').select('*').eq('id', id).single();
  if (error || !card) return;

  await sb.from('postcards').update({ opened: true }).eq('id', id);

  document.getElementById('env-to-addr').innerHTML =
    `To: ${(card.address||[])[0]||currentUser.email}<br>From: ${card.sender_name}`;

  document.getElementById('rev-front').innerHTML = card.photo_data
    ? `<img src="${card.photo_data}" alt="Postcard photo" style="width:100%;height:100%;object-fit:cover"/>`
    : '<span style="color:#aaa">No photo</span>';

  document.getElementById('rev-message').textContent = card.message;

  const addrDiv = document.getElementById('rev-address');
  const lines = card.address || [];
  addrDiv.innerHTML = lines.map(l=>`<div class="rev-addr-line">${l}</div>`).join('');
  for (let i = lines.length; i < 4; i++) addrDiv.innerHTML += `<div class="rev-addr-line"></div>`;

  document.getElementById('env-flap').classList.remove('open');
  document.getElementById('revealed-card').classList.remove('visible');
  document.getElementById('env-prompt').textContent = 'You have a postcard! Tap to open it.';
  envelopeOpened = false;

  goTo('screen-envelope');
}

// ── envelope ──
function openEnvelope() {
  if (envelopeOpened) return;
  envelopeOpened = true;
  document.getElementById('env-flap').classList.add('open');
  document.getElementById('env-prompt').textContent = 'Here it is! ✨';
  setTimeout(() => document.getElementById('revealed-card').classList.add('visible'), 650);
}
