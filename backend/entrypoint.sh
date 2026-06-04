#!/bin/bash
export PIP_PROGRESS_BAR=off
export PIP_NO_CACHE_DIR=1
pip install setuptools wheel
pip install -r requirements.txt
"$@"
