# 📝 Natural Language Processing

## What is NLP?

The field of AI focused on enabling computers to understand, interpret, and generate human language.

## Key Tasks

### Text Classification
- Sentiment analysis
- Spam detection
- Topic categorization

### Named Entity Recognition (NER)
Identifying entities: people, places, organizations, dates.

### Machine Translation
Converting text between languages.

### Question Answering
Extracting answers from context.

### Text Generation
Creating coherent text from prompts.

## Pipeline

```
Raw Text → Tokenization → Preprocessing → Feature Extraction → Model → Output
```

## Preprocessing Steps

1. **Tokenization**: Split text into tokens
2. **Lowercasing**: Normalize case
3. **Stop word removal**: Remove common words
4. **Stemming/Lemmatization**: Reduce to root form
5. **Vectorization**: Convert to numbers

## Modern Approaches

### Traditional
- Bag of Words
- TF-IDF
- Word2Vec, GloVe

### Deep Learning
- [[Transformer Architecture]]
- BERT, GPT
- Fine-tuning pre-trained models

## Code Example

```python
from transformers import pipeline

# Sentiment analysis
classifier = pipeline("sentiment-analysis")
result = classifier("I love this product!")
# [{'label': 'POSITIVE', 'score': 0.9998}]
```

## See Also

- [[Transformer Architecture]]
- [[Text Embeddings]]
- [[Machine Learning Research]]
