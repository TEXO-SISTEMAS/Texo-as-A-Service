(async () => {
  try {
    const res = await fetch('/api/me');
    if (res.status === 401) { window.location.href = '/login'; return; }
    if (!res.ok) return;
    const user = await res.json();

    // ── Styles ──
    const style = document.createElement('style');
    style.textContent = `
      #auth-chip {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 10px;
        background: #1a1a2e;
        border: 1.5px solid rgba(255,255,255,.12);
        border-radius: 40px;
        padding: 6px 14px 6px 6px;
        box-shadow: 0 4px 20px rgba(0,0,0,.4);
        font-family: 'Inter', sans-serif;
        font-size: 13px;
        cursor: default;
        transition: box-shadow .15s;
        user-select: none;
      }
      #auth-chip:hover { box-shadow: 0 6px 28px rgba(0,0,0,.55); }
      #auth-chip .ac-avatar {
        width: 28px; height: 28px; border-radius: 50%;
        background: #f0f040;
        display: flex; align-items: center; justify-content: center;
        font-weight: 700; font-size: 12px; color: #1a1a2e;
        flex-shrink: 0; overflow: hidden;
      }
      #auth-chip .ac-avatar img { width: 100%; height: 100%; object-fit: cover; }
      #auth-chip .ac-name {
        color: rgba(255,255,255,.85);
        font-weight: 500;
        white-space: nowrap;
        max-width: 140px;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #auth-chip .ac-sep {
        width: 1px; height: 16px;
        background: rgba(255,255,255,.15);
      }
      #auth-chip a.ac-logout {
        color: rgba(255,255,255,.4);
        font-size: 12px;
        text-decoration: none;
        white-space: nowrap;
        transition: color .12s;
      }
      #auth-chip a.ac-logout:hover { color: #f87171; }
    `;
    document.head.appendChild(style);

    // ── Chip HTML ──
    const chip = document.createElement('div');
    chip.id = 'auth-chip';

    // Avatar
    const avatar = document.createElement('div');
    avatar.className = 'ac-avatar';
    if (user.picture) {
      const img = document.createElement('img');
      img.src = user.picture;
      img.alt = user.name || '';
      img.onerror = () => { img.remove(); avatar.textContent = initials(user.name); };
      avatar.appendChild(img);
    } else {
      avatar.textContent = initials(user.name);
    }

    // Name
    const name = document.createElement('span');
    name.className = 'ac-name';
    name.title = user.email || '';
    name.textContent = firstName(user.name);

    // Separator
    const sep = document.createElement('span');
    sep.className = 'ac-sep';

    // Admin link (solo para danilo)
    const items = [avatar, name, sep];
    if (user.email === 'danilo.sosa@texo.com.py') {
      const adminLink = document.createElement('a');
      adminLink.className = 'ac-logout';
      adminLink.href = '/admin';
      adminLink.textContent = '⚙ Admin';
      adminLink.style.color = 'rgba(240,240,64,.7)';
      adminLink.onmouseover = () => adminLink.style.color = '#f0f040';
      adminLink.onmouseout  = () => adminLink.style.color = 'rgba(240,240,64,.7)';
      const sep2 = document.createElement('span'); sep2.className = 'ac-sep';
      items.push(adminLink, sep2);
    }

    // Logout
    const logout = document.createElement('a');
    logout.className = 'ac-logout';
    logout.href = '/auth/logout';
    logout.textContent = 'Salir';

    items.push(logout);
    chip.append(...items);
    document.body.appendChild(chip);

  } catch(e) {
    // silent — don't block the page
  }

  function initials(name) {
    if (!name) return '?';
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }
  function firstName(name) {
    if (!name) return 'Usuario';
    return name.split(' ')[0];
  }
})();
