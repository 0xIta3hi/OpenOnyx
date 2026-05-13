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
```




[X/Twitter]<blockquote class="twitter-tweet" data-media-max-width="560"><p lang="en" dir="ltr">I&#39;ve revamped my portfolio, it&#39;s bit minimal and simple<br>inspired from <a href="https://twitter.com/damnGruz?ref_src=twsrc%5Etfw">@damnGruz</a> and <a href="https://twitter.com/ramxcodes?ref_src=twsrc%5Etfw">@ramxcodes</a> again<br>here&#39;s the link: <a href="https://t.co/n7QIFcEFEn">https://t.co/n7QIFcEFEn</a><br><br>I hope you guys will love it, drop some suggestions as well <a href="https://t.co/iIHcAweRxM">pic.twitter.com/iIHcAweRxM</a></p>&mdash; volt (@voltcodes) <a href="https://twitter.com/voltcodes/status/2032406645775749169?ref_src=twsrc%5Etfw">March 13, 2026</a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>