import pandas as pd
import numpy as np
import requests
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier
import xgboost as xgb
from data.feature_engineering import FeatureEngineer
import joblib
import os

def fetch_data_direct(symbol: str, range_val: str = "10y", interval: str = "1d") -> pd.DataFrame:
    """
    Fetch historical chart data from Yahoo Finance API directly using requests.
    This bypasses yfinance's crumb retrieval mechanism that causes HTTP 429 blocks.
    """
    url = f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    params = {
        'range': range_val,
        'interval': interval
    }
    print(f"Fetching {symbol} ({interval}) for range {range_val}...")
    r = requests.get(url, headers=headers, params=params)
    r.raise_for_status()
    data = r.json()
    
    result = data['chart']['result'][0]
    timestamps = result['timestamp']
    quote = result['indicators']['quote'][0]
    
    df = pd.DataFrame({
        'timestamp': pd.to_datetime(timestamps, unit='s'),
        'open': quote['open'],
        'high': quote['high'],
        'low': quote['low'],
        'close': quote['close'],
        'volume': quote['volume']
    })
    df.dropna(inplace=True)
    df.reset_index(drop=True, inplace=True)
    return df

def train_timeframe_model(timeframe: str, range_val: str):
    print(f"\n==================================================")
    print(f"TRAINING MODEL FOR TIMEFRAME: {timeframe}")
    print(f"==================================================")
    
    symbols = ["^NSEI", "RELIANCE.NS", "HDFCBANK.NS"]
    df_list = []
    
    for symbol in symbols:
        try:
            df = fetch_data_direct(symbol, range_val=range_val, interval=timeframe)
            print(f"  Fetched {len(df)} rows for {symbol}.")
            if len(df) < 50:
                print(f"  Insufficient data for {symbol}, skipping.")
                continue
            
            df_features = FeatureEngineer.create_features(df, is_training=True)
            print(f"  Engineered features for {symbol}: {len(df_features)} rows.")
            df_list.append(df_features)
        except Exception as e:
            print(f"  Error loading/processing {symbol}: {e}")
            
    if not df_list:
        print(f"Error: No data available for training timeframe {timeframe}. Skipping.")
        return
        
    df_combined = pd.concat(df_list, ignore_index=True)
    print(f"Combined dataset size: {len(df_combined)} rows.")
    
    X = FeatureEngineer.extract_features(df_combined)
    y = df_combined['target']
    
    # Chronological train-test split to respect time-series properties
    split_idx = int(len(X) * 0.8)
    X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
    y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]
    
    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # Keep as DataFrames with feature names intact for XGBoost
    X_train_scaled = pd.DataFrame(X_train_scaled, columns=X.columns)
    X_test_scaled = pd.DataFrame(X_test_scaled, columns=X.columns)
    
    # Define models
    xgb_model = xgb.XGBClassifier(
        objective='binary:logistic',
        n_estimators=100,
        learning_rate=0.03,
        max_depth=4,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42
    )
    
    rf_model = RandomForestClassifier(
        n_estimators=100,
        max_depth=5,
        random_state=42
    )
    
    # Train
    print("Training XGBoost...")
    xgb_model.fit(X_train_scaled, y_train)
    print("Training Random Forest...")
    rf_model.fit(X_train_scaled, y_train)
    
    # Evaluate Soft-Voting Ensemble
    xgb_proba = xgb_model.predict_proba(X_test_scaled)
    rf_proba = rf_model.predict_proba(X_test_scaled)
    y_pred_proba = (xgb_proba + rf_proba) / 2.0
    
    y_pred = (y_pred_proba[:, 1] > 0.5).astype(int)
    base_acc = accuracy_score(y_test, y_pred)
    print(f"Ensemble Base Accuracy: {base_acc:.4f}")
    
    # Evaluate across a range of thresholds
    print("Threshold Analysis:")
    for th in np.arange(0.50, 0.70, 0.02):
        up_s = y_pred_proba[:, 1] > th
        down_s = y_pred_proba[:, 0] > th
        mask = up_s | down_s
        if mask.sum() > 0:
            acc = accuracy_score(y_test[mask], (y_pred_proba[mask, 1] > th).astype(int))
            cov = mask.sum() / len(y_test) * 100
            print(f"  Threshold {th:.2f} -> Accuracy: {acc:.4f} (coverage: {cov:.1f}%, {mask.sum()} signals)")
        else:
            print(f"  Threshold {th:.2f} -> No signals generated.")
            
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred))
    
    # Save the models and scaler
    # Write models to /app/models (which maps to ./backend/models) and also to ./models locally
    for path_prefix in ["models", "saved_models"]:
        os.makedirs(path_prefix, exist_ok=True)
        model_path = os.path.join(path_prefix, f"ensemble_{timeframe}.joblib")
        scaler_path = os.path.join(path_prefix, f"scaler_{timeframe}.joblib")
        
        model_data = {
            "xgb": xgb_model,
            "rf": rf_model,
            "is_trained": True
        }
        
        joblib.dump(model_data, model_path)
        joblib.dump(scaler, scaler_path)
        print(f"Saved ensemble to {model_path}")
        print(f"Saved scaler to {scaler_path}")

def main():
    # Loop over all timeframes and train
    timeframe_configs = {
        "15m": "60d",
        "30m": "60d",
        "1h": "730d",
        "1d": "10y"
    }
    
    for tf, r_val in timeframe_configs.items():
        try:
            train_timeframe_model(tf, r_val)
        except Exception as e:
            print(f"Error training model for timeframe {tf}: {e}")

if __name__ == "__main__":
    main()
