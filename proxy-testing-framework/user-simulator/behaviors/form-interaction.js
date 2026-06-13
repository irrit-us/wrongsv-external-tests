/**
 * form-interaction — Simulates login/signup form filling: page load,
 * typing into form fields, button clicks, POST submissions.
 */

exports.name = "form-interaction";
exports.description =
  "Simulates login/signup: form filling, typing, POST submissions";

exports.generateSession = function ({ duration = 30000, targets = null } = {}) {
  const actions = [];
  const formPage = targets?.formPage || "https://httpbin.org/forms/post";
  const apiPage = targets?.apiPage || "https://httpbin.org/post";
  const xhrEndpoint = targets?.xhrEndpoint || "/post";

  // Load a page with a form
  actions.push(
    {
      type: "navigate",
      url: formPage,
      waitUntil: "networkidle2",
      label: "load-form",
    },
    { type: "wait", ms: randomBetween(500, 1500), label: "form-render" }
  );

  // Fill in form fields
  actions.push(
    { type: "type", selector: 'input[name="custname"]', text: "Test User", label: "fill-name" },
    { type: "wait", ms: randomBetween(200, 600), label: "pause-name" },
    { type: "type", selector: 'input[name="custtel"]', text: "1234567890", label: "fill-phone" },
    { type: "wait", ms: randomBetween(200, 600), label: "pause-phone" },
    { type: "type", selector: 'input[name="custemail"]', text: "test@example.com", label: "fill-email" },
    { type: "wait", ms: randomBetween(200, 600), label: "pause-email" }
  );

  // Check a radio/checkbox
  actions.push(
    { type: "click", selector: 'input[value="medium"]', label: "select-size" },
    { type: "wait", ms: randomBetween(200, 500), label: "pause-size" }
  );

  // Type in a textarea
  actions.push(
    { type: "type", selector: 'textarea[name="comments"]', text: "This is a test order.", label: "fill-comments" },
    { type: "wait", ms: randomBetween(300, 800), label: "pause-comments" },
    { type: "scroll", distance: 200, label: "scroll-form" }
  );

  // Submit the form (POST request through proxy)
  actions.push(
    { type: "click", selector: 'button[type="submit"]', label: "submit" },
    { type: "wait", ms: randomBetween(1000, 3000), label: "submit-response" }
  );

  // Navigate to another form-like endpoint for variety
  const remaining = duration - 10000;
  if (remaining > 5000) {
    actions.push(
      {
        type: "navigate",
        url: apiPage,
        waitUntil: "networkidle2",
        label: "api-page",
      },
      {
        type: "evaluate",
        code: `fetch(${JSON.stringify(xhrEndpoint)}, {method:'POST', body:JSON.stringify({action:'test',ts:Date.now()}), headers:{'Content-Type':'application/json'}})`,
        label: "xhr-post",
      },
      { type: "wait", ms: randomBetween(1000, 2000), label: "xhr-wait" }
    );
  }

  return actions;
};

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
