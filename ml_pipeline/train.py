import yfinance as yf
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
from data.feature_engineering import FeatureEngineer
from models.xgboost_model import XGBoostTrader
import os

def fetch_data(symbol: str) -> pd.DataFrame:
    # Fetch 2 years of daily data for training
    ticker = yf.Ticker(symbol)
    df = ticker.history(period="2y", interval="1d")
    df.reset_index(inplace=True)
    df.rename(columns={
        'Date': 'timestamp', 'Open': 'open', 'High': 'high', 
        'Low': 'low', 'Close': 'close', 'Volume': 'volume'
    }, inplace=True)
    return df

def main():
    print("Fetching data for training...")
    # Training on an index like NIFTY or S&P 500
    df = fetch_data("^NSEI") 
    
    print("Engineering features...")
    df_features = FeatureEngineer.create_features(df)
    
    X = FeatureEngineer.extract_features(df_features)
    y = df_features['target']
    
    # Train-test split (chronological)
    split_idx = int(len(X) * 0.8)
    X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
    y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]
    
    print(f"Training on {len(X_train)} samples, testing on {len(X_test)} samples.")
    
    trader = XGBoostTrader()
    trader.train(X_train, y_train)
    
    # Evaluation
    y_pred_proba = trader.predict_proba(X_test)
    y_pred = (y_pred_proba[:, 1] > 0.5).astype(int)
    
    acc = accuracy_score(y_test, y_pred)
    print(f"\nModel Accuracy: {acc:.2f}")
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred))
    
    # Save the model
    os.makedirs("saved_models", exist_ok=True)
    model_path = "saved_models/xgboost_nsei.joblib"
    trader.save(model_path)
    print(f"\nModel saved to {model_path}")

if __name__ == "__main__":
    import pandas as pd
    main()
