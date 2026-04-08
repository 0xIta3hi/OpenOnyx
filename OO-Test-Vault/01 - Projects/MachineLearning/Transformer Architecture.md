# 🔄 Transformer Architecture

## Overview

Introduced in "Attention Is All You Need" (2017). Foundation of modern NLP models like GPT, BERT, etc.

## Key Innovation: Self-Attention

Instead of processing sequences step-by-step (like RNNs), transformers process all positions in parallel.

## Architecture

```
┌─────────────────────────────────┐
│         Output Probabilities     │
├─────────────────────────────────┤
│         Linear + Softmax         │
├─────────────────────────────────┤
│         Decoder Stack            │
│  ┌─────────────────────────┐    │
│  │ Feed Forward            │    │
│  │ Cross-Attention         │    │
│  │ Masked Self-Attention   │    │
│  └─────────────────────────┘    │
├─────────────────────────────────┤
│         Encoder Stack            │
│  ┌─────────────────────────┐    │
│  │ Feed Forward            │    │
│  │ Self-Attention          │    │
│  └─────────────────────────┘    │
├─────────────────────────────────┤
│   Positional Encoding + Embed   │
├─────────────────────────────────┤
│           Input Tokens           │
└─────────────────────────────────┘
```

## Self-Attention Formula

```
Attention(Q, K, V) = softmax(QK^T / √d_k) V
```

Where:
- Q = Query matrix
- K = Key matrix
- V = Value matrix
- d_k = dimension of keys

## Multi-Head Attention

Allows model to attend to different representation subspaces:

```python
class MultiHeadAttention(nn.Module):
    def __init__(self, d_model, num_heads):
        super().__init__()
        self.heads = nn.ModuleList([
            AttentionHead(d_model, d_model // num_heads)
            for _ in range(num_heads)
        ])
        self.linear = nn.Linear(d_model, d_model)
```

## Applications

- [[GPT Models]]
- [[BERT]]
- [[Vision Transformers]]
- Translation, summarization, code generation

## See Also

- [[Neural Networks Fundamentals]]
- [[Natural Language Processing]]
- [[Attention Mechanism]]
