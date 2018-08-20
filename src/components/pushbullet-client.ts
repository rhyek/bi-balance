import fetch from 'node-fetch';
import WebSocket from 'ws';
import Raven from 'raven';
import queryBank from '../query-bank';

interface Notification {
  thread_id: string;
  title: string;
  body: string;
  timestamp: number;
}

const keywords = ['consumo', 'reversion', 'retiro', 'debito', 'credito'];

const ws = new WebSocket(`wss://stream.pushbullet.com/websocket/${process.env.PUSHBULLET_API_KEY}`);
ws.on('message', async data => {
  try {
    const json = JSON.parse(data as string);
    if (
      json.type === 'push' &&
      json.push.type === 'sms_changed' &&
      json.push.notifications.length > 0 &&
      json.push.notifications.some(
        (notification: Notification) =>
          (notification.title === '30274143' && notification.body.toLowerCase().includes('ec')) ||
          (notification.title === '+2424' &&
            keywords.some(keyword => notification.body.toLowerCase().includes(keyword)))
      )
    ) {
      console.log('ws message', data);
      const result = await queryBank();
      const message = [
        `Q. ${result.total.formatted.Q}`,
        `$ ${result.total.formatted.$}`,
        `${result.duration}ms`,
      ].join('\n');
      await fetch('https://api.pushbullet.com/v2/pushes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Token': process.env.PUSHBULLET_API_KEY!,
        },
        body: JSON.stringify({
          type: 'note',
          title: 'bi-balance',
          body: message,
        }),
      });
      console.log('notified', message);
    }
  } catch (error) {
    if (process.env.SENTRY_ENABLED === 'true') {
      Raven.captureException(error, {
        extra: {
          message: data,
        },
      });
    } else {
      console.error(error);
    }
  }
});
