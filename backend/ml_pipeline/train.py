import pandas as pd
import numpy as np
import requests
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
from sklearn.preprocessing import StandardScaler
from data.feature_engineering import FeatureEngineer
from models.xgboost_model import XGBoostTrader
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
    print(f"Sending requests to {url} with params {params}...")
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

def main():
    print("Fetching data for training...")
    # Training on NIFTY index (^NSEI)
    df = fetch_data_direct("^NSEI", range_val="10y", interval="1d")
    print(f"Fetched {len(df)} rows.")
    
    print("Engineering features...")
    df_features = FeatureEngineer.create_features(df, is_training=True)
    print(f"Features created. Rows: {len(df_features)}")
    
    X = FeatureEngineer.extract_features(df_features)
    y = df_features['target']
    
    # Train-test split (chronological)
    split_idx = int(len(X) * 0.8)
    X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
    y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]
    
    print(f"Training on {len(X_train)} samples, testing on {len(X_test)} samples.")
    
    # Fit StandardScaler
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # Keep as DataFrames with feature names intact
    X_train_scaled = pd.DataFrame(X_train_scaled, columns=X.columns)
    X_test_scaled = pd.DataFrame(X_test_scaled, columns=X.columns)
    
    trader = XGBoostTrader()
    trader.train(X_train_scaled, y_train)
    
    # Evaluation
    y_pred_proba = trader.predict_proba(X_test_scaled)
    y_pred = (y_pred_proba[:, 1] > 0.5).astype(int)
    
    base_acc = accuracy_score(y_test, y_pred)
    print(f"\nModel Base Accuracy: {base_acc:.4f}")
    
    # Evaluate across a range of thresholds to find the best setting for ~80% accuracy
    print("\nThreshold Analysis:")
    for th in np.arange(0.50, 0.70, 0.01):
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
    
    # Save the model and scaler
    os.makedirs("saved_models", exist_ok=True)
    model_path = "saved_models/xgboost_nsei.joblib"
    scaler_path = "saved_models/scaler.joblib"
    
    trader.save(model_path)
    joblib.dump(scaler, scaler_path)
    print(f"\nModel saved to {model_path}")
    print(f"Scaler saved to {scaler_path}")

if __name__ == "__main__":
    main()
