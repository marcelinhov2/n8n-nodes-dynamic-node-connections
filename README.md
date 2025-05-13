![Banner image](https://user-images.githubusercontent.com/10284570/173569848-c624317f-42b1-45a6-ab09-f0ea3c247648.png)

# n8n Dynamic Node

**`n8n-nodes-dynamic-node`** lets you inject and execute *any* standard n8n node at runtime by pasting its workflow‑export JSON into a single wrapper node.

---

## Installation

### Community Nodes (Recommended)

For users on n8n v0.187+, your instance owner can install this node from [Community Nodes](https://docs.n8n.io/integrations/community-nodes/installation/).

1. Go to **Settings > Community Nodes**.
2. Select **Install**.
3. Enter `n8n-nodes-dynamic-node` in **Enter npm package name**.
4. Agree to the [risks](https://docs.n8n.io/integrations/community-nodes/risks/) of using community nodes: select **I understand the risks of installing unverified code from a public source**.
5. Select **Install**.

After installing the node, you can use it like any other node. n8n displays the node in search results in the **Nodes** panel.

### Manual

1. In your n8n instance directory, install from npm:

   ```bash
   npm install n8n-nodes-dynamic-node --save
   ```
2. Restart n8n.
3. You’ll now see **Dynamic Node** under **Transform** in the node picker.

For Docker-based deployments, add the following line before the font installation command in your [n8n Dockerfile](https://github.com/n8n-io/n8n/blob/master/docker/images/n8n/Dockerfile):

`RUN cd /usr/local/lib/node_modules/n8n && npm install n8n-nodes-dynamic-node`

---

## Usage

1. **Wire up** Dynamic Node: connect any upstream node whose items you want to pass through.

2. **Switch the `Node JSON` field into *Expression* mode** (click **Fixed** → **Expression**).

3. **Paste your exported‑node JSON** into the editor. For example, a simple Graph API call:

   ```json
   {
     "parameters": {
       "url": "=https://graph.microsoft.com/v1.0/users/{{ $json.id_msft }}?$select=accountEnabled,userPrincipalName,id",
       "authentication": "genericCredentialType",
       "genericAuthType": "oAuth2Api",
       "options": {}
     },
     "type": "n8n-nodes-base.httpRequest",
     "typeVersion": 4.2,
     "position": [460, -520],
     "id": "fetch-enta-user-enabled-status-dynamic",
     "name": "Fetch Current Azure Status",
     "credentials": {
       "oAuth2Api": {
         "id": "{{ $json.credential_id }}",
         "name": "{{ $json.credential_name }}"
       }
     },
     "onError": "continueRegularOutput"
   }
   ```

4. **Click *Test step***. The node will:

   * Clone an internal **Start → YOUR NODE** mini‑workflow.
   * Evaluate any `{{…}}` expressions (`$json`, etc.).
   * Execute the underlying node with your credentials and input items.
   * Return its output as the Dynamic Node’s own output.

> **Note:** More complex node options like pagination that rely on elements from `$response` don't seem to work since that isn't handled properly in sub-workflow/child execution contexts.

---

## Tips & Troubleshooting

* Always use **Expression mode** when your JSON contains `={{…}}` placeholders.
* Ensure your pasted JSON is a **true object** (no wrapping quotes).
* Double‑check that your exported node JSON includes a unique `name` field.
* If you see **“Node JSON must be an object”**, switch to Expression mode and remove stray quotes.

## License

[MIT](https://github.com/drowl87/n8n-nodes-dynamic-node/blob/master/LICENSE.md)

---

Happy automating with the world’s first **Dynamic Node** for n8n! 🚀
