const { initializeApp } = require('firebase-admin/app');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');

initializeApp();
setGlobalOptions({ region: 'europe-west1', maxInstances: 5 });

exports.ownerHealthCheck = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in is required.');
  }
  if (request.auth.token.owner !== true) {
    throw new HttpsError('permission-denied', 'Owner access is required.');
  }
  return { ok: true, uid: request.auth.uid };
});
