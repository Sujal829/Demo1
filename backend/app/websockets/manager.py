import socketio
import logging

logger = logging.getLogger(__name__)

# Create a Socket.IO server with async mode and ASGI integration
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')

# Wrap with ASGI application
sio_app = socketio.ASGIApp(socketio_server=sio)

@sio.event
async def connect(sid, environ):
    logger.info(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    logger.info(f"Client disconnected: {sid}")

@sio.event
async def subscribe(sid, data):
    """
    Client can subscribe to a specific symbol for updates
    data: {"symbol": "RELIANCE.NS"}
    """
    symbol = data.get("symbol")
    if symbol:
        sio.enter_room(sid, symbol)
        logger.info(f"Client {sid} subscribed to {symbol}")
        await sio.emit("message", {"msg": f"Subscribed to {symbol}"}, to=sid)

async def broadcast_signal(signal_data: dict):
    """
    Broadcast a new signal to all clients (globally) and to the symbol's room.
    """
    symbol = signal_data.get("symbol")
    # Emit globally for general listeners like SignalList and Heatmap
    await sio.emit("signal_update", signal_data)
    
    # Emit to symbol-specific room for subscribers
    if symbol:
        await sio.emit("signal_update", signal_data, room=symbol)
