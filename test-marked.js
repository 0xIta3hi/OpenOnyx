const { marked } = require('marked');
marked.use({
  renderer: {
    image(token) {
      return `<img src="TEST-${token.href}" alt="${token.text}" />`;
    }
  }
});
console.log(marked.parse('![alt](src)'));
