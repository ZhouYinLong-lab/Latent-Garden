# Static frontend

Serve this directory with any static server. The page loads garden.json from the same directory by default.

To use another output file, open /frontend/?data=https://example.com/path/garden.json.

The data URL must allow browser CORS when it is hosted on another origin.

## iframe embed

The frontend supports a compact embed mode. The API and static frontend can be on the same host:

    <iframe
      src="https://garden.example.com/frontend/?embed=1&data=/api/garden"
      title="Latent Garden"
      style="width:100%;height:720px;border:0"
      loading="lazy">
    </iframe>

Optional query parameters:

- embed=1 hides the page masthead and footer.
- data= points to a garden.json URL.
- cluster=0 opens with a specific cluster selected.
