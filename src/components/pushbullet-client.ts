import fetch from 'node-fetch';
import WebSocket from 'ws';
import queryBank from '../query-bank';

interface Notification {
  thread_id: string;
  title: string;
  body: string;
  timestamp: number;
}

const ws = new WebSocket(`wss://stream.pushbullet.com/websocket/${process.env.PUSHBULLET_API_KEY}`);
ws.on('message', async data => {
  try {
    const json = JSON.parse(data as string);
    if (
      json.type === 'push' &&
      json.push.type === 'sms_changed' &&
      json.push.notifications.length > 0 &&
      json.push.notifications.some((notification: Notification) =>
        // notification.title === '+2424' &&
        notification.body.toLowerCase().includes('bimovil')
      )
    ) {
      console.log('ws message', data);
      const result = await queryBank();
      const message = [
        `Q. ${result.accounts[0].available.formatted.Q}`,
        `$ ${result.accounts[0].available.formatted.$}`,
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
  } catch (e) {
    console.error(e);
  }
});
