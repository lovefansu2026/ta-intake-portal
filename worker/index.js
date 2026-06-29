/**
 * TA-Intake Portal API Worker
 * Handles form submissions and data retrieval for the team dashboard
 */

// CORS headers
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      // POST /api/submissions - Store new form submission
      if (path === '/api/submissions' && method === 'POST') {
        const body = await request.json();

        // Validate required fields - check both flat and nested structures
        const name = body.name || (body.sections && body.sections.basic_info && body.sections.basic_info.name);
        const phone = body.phone || (body.sections && body.sections.basic_info && body.sections.basic_info.phone);
        if (!name || !phone) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: name, phone' }),
            { status: 400, headers: CORS_HEADERS }
          );
        }

        // Generate unique ID
        const id = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Create submission record
        const submission = {
          id,
          timestamp: new Date().toISOString(),
          ...body,
          status: 'new', // new, contacted, in_progress, closed
        };

        // Store in KV
        await env.SUBMISSIONS.put(id, JSON.stringify(submission));

        // Store in index for easy listing
        const index = await env.SUBMISSIONS.get('index', 'json') || [];
        index.unshift({
          id,
          timestamp: submission.timestamp,
          name: name,
          phone: phone,
          status: 'new',
        });
        await env.SUBMISSIONS.put('index', JSON.stringify(index));

        return new Response(
          JSON.stringify({ success: true, id, message: 'Submission stored successfully' }),
          { headers: CORS_HEADERS }
        );
      }

      // GET /api/submissions - List all submissions with full data
      if (path === '/api/submissions' && method === 'GET') {
        const index = await env.SUBMISSIONS.get('index', 'json') || [];

        // Optional: filter by status
        const status = url.searchParams.get('status');
        const filtered = status ? index.filter(item => item.status === status) : index;

        // Optional: get full details for specific ID
        const id = url.searchParams.get('id');
        if (id) {
          const full = await env.SUBMISSIONS.get(id, 'json');
          if (!full) {
            return new Response(
              JSON.stringify({ error: 'Submission not found' }),
              { status: 404, headers: CORS_HEADERS }
            );
          }
          return new Response(JSON.stringify(full), { headers: CORS_HEADERS });
        }

        // Return full submission data for all index entries
        // This ensures the team dashboard receives complete data including
        // _meta, sections.*, and deadline_reminders fields
        const results = [];
        for (const item of filtered) {
          const full = await env.SUBMISSIONS.get(item.id, 'json');
          if (full) {
            results.push(full);
          } else {
            // KV entry may have been deleted; fall back to index summary
            results.push(item);
          }
        }

        return new Response(JSON.stringify(results), { headers: CORS_HEADERS });
      }

      // PATCH /api/submissions/:id - Update submission status
      if (path.match(/^\/api\/submissions\/[^/]+$/) && method === 'PATCH') {
        const id = path.split('/').pop();
        const body = await request.json();

        const existing = await env.SUBMISSIONS.get(id, 'json');
        if (!existing) {
          return new Response(
            JSON.stringify({ error: 'Submission not found' }),
            { status: 404, headers: CORS_HEADERS }
          );
        }

        const updated = { ...existing, ...body, updatedAt: new Date().toISOString() };
        await env.SUBMISSIONS.put(id, JSON.stringify(updated));

        // Update index
        const index = await env.SUBMISSIONS.get('index', 'json') || [];
        const idx = index.findIndex(item => item.id === id);
        if (idx !== -1) {
          index[idx] = { ...index[idx], ...body };
          await env.SUBMISSIONS.put('index', JSON.stringify(index));
        }

        return new Response(
          JSON.stringify({ success: true, message: 'Submission updated' }),
          { headers: CORS_HEADERS }
        );
      }

      // DELETE /api/submissions/:id - Delete submission
      if (path.match(/^\/api\/submissions\/[^/]+$/) && method === 'DELETE') {
        const id = path.split('/').pop();

        await env.SUBMISSIONS.delete(id);

        // Remove from index
        const index = await env.SUBMISSIONS.get('index', 'json') || [];
        const filtered = index.filter(item => item.id !== id);
        await env.SUBMISSIONS.put('index', JSON.stringify(filtered));

        return new Response(
          JSON.stringify({ success: true, message: 'Submission deleted' }),
          { headers: CORS_HEADERS }
        );
      }

      // Health check
      if (path === '/api/health') {
        return new Response(
          JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }),
          { headers: CORS_HEADERS }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Not found' }),
        { status: 404, headers: CORS_HEADERS }
      );
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(
        JSON.stringify({ error: 'Internal server error', message: error.message }),
        { status: 500, headers: CORS_HEADERS }
      );
    }
  },
};
