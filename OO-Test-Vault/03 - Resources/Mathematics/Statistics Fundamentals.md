# 📈 Statistics Fundamentals

## Descriptive Statistics

### Measures of Central Tendency

| Measure | Description | Formula |
|---------|-------------|---------|
| Mean | Average | Σx / n |
| Median | Middle value | Sort, pick middle |
| Mode | Most frequent | Count occurrences |

### Measures of Spread

- **Variance**: σ² = Σ(x - μ)² / n
- **Standard Deviation**: σ = √variance
- **Range**: max - min
- **IQR**: Q3 - Q1

```python
import numpy as np

data = [1, 2, 3, 4, 5]

np.mean(data)   # 3.0
np.median(data) # 3.0
np.std(data)    # 1.414
np.var(data)    # 2.0
```

## Probability Distributions

### Normal Distribution
Bell curve, defined by μ (mean) and σ (std dev).

### Common Distributions
- **Uniform**: Equal probability
- **Binomial**: n trials, p success probability
- **Poisson**: Events per time period

## Hypothesis Testing

1. State null hypothesis (H₀)
2. State alternative hypothesis (H₁)
3. Choose significance level (α = 0.05)
4. Calculate test statistic
5. Make decision

### p-value
Probability of observing results at least as extreme as what we got, assuming H₀ is true.

- p < 0.05: Reject H₀
- p ≥ 0.05: Fail to reject H₀

## Correlation

```python
# Pearson correlation
np.corrcoef(x, y)

# Values: -1 to 1
# -1: Perfect negative
#  0: No correlation
#  1: Perfect positive
```

## See Also

- [[Probability Theory]]
- [[Mathematics for ML]]
- [[Pandas]]
