import handler from 'vinext/server/fetch-handler';
import {purgeExpired} from '../lib/recycle';

export default {
  ...handler,
  async scheduled(_event: ScheduledController, env: {DB:D1Database;BUCKET:R2Bucket}) {
    await purgeExpired(env.DB, env.BUCKET);
  },
};
