document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    socket.on('connect', () => console.log('Controller connected!'));

    // ── Spawn buttons ─────────────────────────────────────────────────────────
    document.querySelectorAll('.spawn-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            socket.emit('add-object', { type: btn.dataset.type });
            // Brief visual feedback
            btn.style.opacity = '0.6';
            setTimeout(() => btn.style.opacity = '1', 150);
        });
    });

    // ── Fire actions ──────────────────────────────────────────────────────────
    document.getElementById('fire-btn').addEventListener('click', () => {
        socket.emit('trigger-fire');
    });

    document.getElementById('stop-fire-btn').addEventListener('click', () => {
        socket.emit('stop-fire');
    });

    // ── Live state updates from simulation ────────────────────────────────────
    socket.on('state-update', (data) => {
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        set('stat-pandas', data.pandas);
        set('stat-bamboo', data.bamboo);
        set('stat-trees', data.trees);
        set('stat-factories', data.factories);
        set('stat-humans', data.humans);

        const fireEl = document.getElementById('stat-fire');
        if (fireEl) {
            fireEl.textContent = data.fire ? '🔥 ON' : 'OFF';
            fireEl.parentElement.classList.toggle('active', data.fire);
        }
    });
});
