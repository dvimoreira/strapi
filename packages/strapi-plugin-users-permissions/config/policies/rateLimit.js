const defaultOptions = {
  interval: 60000, // 1min
  max: 5,
};

const getMessage = ctx =>
  ctx.request.admin
    ? [{ messages: [{ id: 'Auth.form.error.ratelimit' }] }]
    : 'Too many attempts, please try again in a minute.';

const getKey = ctx => {
  if (ctx.state.user && ctx.state.user.id) {
    return `${ctx.request.url}|${ctx.state.user.id}`;
  }

  return `${ctx.request.url}|${ctx.request.ip}`;
};

const keyMap = {};
const store = {
  getKey(key, opts) {
    if (!keyMap[key]) {
      keyMap[key] = {
        counter: 0,
        endDate: Date.now() + opts.interval,
      };
    }
    return keyMap[key];
  },

  clearExpiredKeys() {
    const now = Date.now();
    for (const key in keyMap) {
      if (keyMap[key].endDate <= now) {
        delete keyMap[key];
      }
    }
  },

  incr(key, opts) {
    this.clearExpiredKeys();
    const value = this.getKey(key, opts);
    value.counter++;
    return value;
  },

  decr(key, opts) {
    const value = this.getKey(key, opts);
    value.counter--;
    return this;
  },
};

module.exports = async (ctx, next) => {
  const opts = {
    ...defaultOptions,
    ...strapi.plugins['users-permissions'].config.ratelimit,
  };

  const key = getKey(ctx);

  const { counter, endDate } = store.incr(key, opts);
  const remaining = Math.max(opts.max - counter, 0);
  const reset = Math.ceil(new Date(endDate).getTime() / 1000);

  ctx.set('X-RateLimit-Limit', opts.max);
  ctx.set('X-RateLimit-Remaining', remaining);
  ctx.set('X-RateLimit-Reset', reset);

  if (counter > opts.max) {
    ctx.status = 429;
    ctx.body = getMessage(ctx);
    ctx.set('Retry-After', Math.ceil(opts.interval / 1000));
    return;
  }

  return next();
};
