# Enterprise AI-Powered Trading Intelligence Platform

A comprehensive, production-grade AI-powered trading intelligence platform built with a modern tech stack.

## Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, TypeScript, Redux Toolkit
- **Backend**: Python 3.12, FastAPI, MongoDB, Celery, Redis
- **Machine Learning**: Scikit-Learn, XGBoost, LightGBM
- **Infrastructure**: Docker, Nginx, Linux

## Features

- Real-time Market Data & Advanced Charts (TradingView)
- Technical Indicators & Candlestick Pattern Recognition
- AI-Powered Trading Signals (Buy/Sell/Hold)
- Backtesting Engine
- Portfolio & Risk Management
- Real-time WebSockets Updates
- Comprehensive Admin Dashboard

## Setup & Running

### Requirements
- Docker and Docker Compose
- Node.js (for local frontend development)
- Python 3.12 (for local backend/ML development)

### Quick Start with Docker

```bash
make build
make up
```

Access the frontend at `http://localhost:5173` and the backend API docs at `http://localhost:8000/docs`.
