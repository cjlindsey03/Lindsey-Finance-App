function ok(body) {
  return { statusCode: 200, body: JSON.stringify(body) };
}

function badRequest(message) {
  return { statusCode: 400, body: JSON.stringify({ error: message }) };
}

function notFound(message = 'Not found') {
  return { statusCode: 404, body: JSON.stringify({ error: message }) };
}

function noContent() {
  return { statusCode: 204, body: '' };
}

function parseBody(event) {
  try {
    return JSON.parse(event.body || '{}');
  } catch {
    return null;
  }
}

module.exports = { ok, badRequest, notFound, noContent, parseBody };
