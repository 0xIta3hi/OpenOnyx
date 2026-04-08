#  Data Preprocessing

## Pipeline Steps

1. **Load data**
2. **Handle missing values**
3. **Encode categories**
4. **Scale features**
5. **Split data**

## Missing Values

```python
import pandas as pd

# Check missing
df.isnull().sum()

# Fill with mean
df['column'].fillna(df['column'].mean(), inplace=True)

# Drop rows
df.dropna(subset=['important_col'], inplace=True)
```

## Encoding

```python
from sklearn.preprocessing import LabelEncoder, OneHotEncoder

# Label encoding (ordinal)
le = LabelEncoder()
df['category'] = le.fit_transform(df['category'])

# One-hot encoding (nominal)
df = pd.get_dummies(df, columns=['category'])
```

## Scaling

```python
from sklearn.preprocessing import StandardScaler, MinMaxScaler

# Standardization (z-score)
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# Normalization (0-1 range)
scaler = MinMaxScaler()
X_normalized = scaler.fit_transform(X)
```

## See Also

- [[Machine Learning Research]]
- [[Statistics Fundamentals]]
