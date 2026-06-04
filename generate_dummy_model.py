import xgboost as xgb
import joblib
import pandas as pd
import numpy as np
import os

# Create dummy data for training
# Features: 'rsi', 'macd', 'macd_signal', 'macd_hist', 'ema_20', 'ema_50', 'atr', 'return_1p', 'return_3p', 'vol_ratio'
X = pd.DataFrame(np.random.rand(100, 10), columns=[
    'rsi', 'macd', 'macd_signal', 'macd_hist', 
    'ema_20', 'ema_50', 'atr', 'return_1p', 'return_3p', 'vol_ratio'
])
y = np.random.randint(0, 2, 100)

model = xgb.XGBClassifier(
    objective='binary:logistic',
    n_estimators=10,
    max_depth=3
)
model.fit(X, y)

os.makedirs("backend/models", exist_ok=True)
model_path = "backend/models/xgboost_nsei.joblib"
joblib.dump(model, model_path)
print(f"Dummy model saved to {model_path}")
