const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const path = require('path');

const io = new Server(server, {
    cors: {
        origin: ['http://localhost:8000', 'http://127.0.0.1:8000'],
        methods: ['GET', 'POST']
    }
});

// Serve controller page from /public
app.use(express.static(path.join(__dirname, 'public')));

// Socket.IO relay
io.on('connection', (socket) => {
    console.log('Connected:', socket.id);

    // Controller → Simulation
    socket.on('add-object', (d) => { socket.broadcast.emit('add-object', d); console.log('add-object:', d.type); });
    socket.on('trigger-fire', () => { socket.broadcast.emit('trigger-fire'); console.log('trigger-fire'); });
    socket.on('stop-fire', () => { socket.broadcast.emit('stop-fire'); console.log('stop-fire'); });

    // Simulation → Controller  (state counts)
    socket.on('state-update', (d) => { socket.broadcast.emit('state-update', d); });

    socket.on('disconnect', () => console.log('Disconnected:', socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\nNode backend   : http://localhost:${PORT}`);
    console.log(`Controller page: http://localhost:${PORT}/control.html`);
    console.log(`Simulation     : http://localhost:8000  (run: python -m http.server 8000)\n`);
});
