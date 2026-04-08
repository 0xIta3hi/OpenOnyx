# ⏳ Async Programming

## Callbacks

```javascript
fetchData((error, data) => {
  if (error) handleError(error);
  else processData(data);
});
```

## Promises

```javascript
fetchData()
  .then(data => processData(data))
  .catch(error => handleError(error));
```

## Async/Await

```javascript
async function getData() {
  try {
    const data = await fetchData();
    return processData(data);
  } catch (error) {
    handleError(error);
  }
}
```

## Parallel Execution

```javascript
const [users, posts] = await Promise.all([
  fetchUsers(),
  fetchPosts()
]);
```

## See Also

- [[JavaScript]]
- [[Node.js]]
