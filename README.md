# MTGA Set Collection Strategy

A website that aims to help users determine the optimal way to finish collecting a full MTG Arena set.  The site itself can be accessed at [this link](https://dpesce.github.io/mtga-set-collector/).

## Local preview

Because the calculator fetches JSON and runs Javascript, it's best to use a local server for previewing the website when making changes rather than opening the HTML file directly.  Start by opening a local host:

```bash
cd docs
python -m http.server 8000
```

Then the website can be previewed at [http://localhost:8000/math.html](http://localhost:8000/).