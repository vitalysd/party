import unittest

from app.core.sockets import ConnectionManager


class Socket:
    def __init__(self, fail=False):
        self.fail = fail
        self.messages = []
        self.on_send = None

    async def accept(self):
        pass

    async def send_text(self, text):
        if self.on_send:
            self.on_send()
        if self.fail:
            raise ConnectionError('Disconnected')
        self.messages.append(text)


class ConnectionManagerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.manager = ConnectionManager()
        self.first = Socket()
        self.second = Socket()
        await self.manager.connect(self.first, 'user')
        await self.manager.connect(self.second, 'user')

    async def test_tabs_keep_independent_subscriptions(self):
        self.manager.subscribe_channel('chat', self.first)
        self.manager.subscribe_channel('chat', self.second)
        self.manager.unsubscribe_channel('chat', self.first)
        await self.manager.broadcast_to_channel('chat', {'type': 'NEW_MESSAGE'})
        self.assertEqual(len(self.first.messages), 0)
        self.assertEqual(len(self.second.messages), 1)

    async def test_disconnect_preserves_other_tab(self):
        self.manager.subscribe_channel('first-chat', self.first)
        self.manager.subscribe_channel('second-chat', self.second)
        self.manager.disconnect(self.first, 'user')
        self.assertNotIn('first-chat', self.manager.channel_subscribers)
        self.assertTrue(self.manager.is_user_online('user'))
        await self.manager.broadcast_to_channel('second-chat', {})
        self.assertEqual(len(self.second.messages), 1)

    async def test_failed_delivery_cleans_connections_and_subscriptions(self):
        self.first.fail = self.second.fail = True
        self.manager.subscribe_channel('chat', self.first)
        self.manager.subscribe_channel('chat', self.second)
        await self.manager.broadcast({})
        self.assertFalse(self.manager.is_user_online('user'))
        self.assertEqual(self.manager.active_user_connections, {})
        self.assertEqual(self.manager.channel_subscribers, {})

    async def test_connection_mutation_during_delivery(self):
        self.first.on_send = lambda: self.manager.disconnect(self.first, 'user')
        self.second.on_send = lambda: self.manager.disconnect(self.second, 'user')
        await self.manager.send_personal_message({}, 'user')
        self.assertEqual(len(self.first.messages), 1)
        self.assertEqual(len(self.second.messages), 1)
        self.assertFalse(self.manager.is_user_online('user'))

    async def test_personal_delivery_reaches_all_tabs(self):
        await self.manager.send_personal_message({}, 'user')
        self.assertEqual(len(self.first.messages), 1)
        self.assertEqual(len(self.second.messages), 1)


if __name__ == '__main__':
    unittest.main()
