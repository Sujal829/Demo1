#!/bin/bash
export PIP_PROGRESS_BAR=off
export PIP_NO_CACHE_DIR=1
pip install setuptools wheel
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
