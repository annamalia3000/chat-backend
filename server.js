import http from "http"; // http-сервер
import express from "express"; // веб-сервер
import WebSocket, { WebSocketServer } from "ws";
import cors from "cors"; // межсайтовый обмен
import bodyParser from "body-parser"; // парсинг тела HTTP-запросов (в формате JSON)
import * as crypto from "crypto"; // id

const app = express();

app.use(cors()); // создаем экземпляр приложения Express
app.use(
  bodyParser.json({ // middleware для парсинга тела запросов как JSON
    type(req) {
      return true;
    },
  })
);

app.use((req, res, next) => {
  res.setHeader("Content-Type", "application/json"); // заголовок для всех ответов
  next(); // передаем управление следующему middleware
});

// Массив для хранения пользователей
const userState = [];
// Массив для хранения истории сообщений
const messageHistory = [];

// HTTP маршрут для регистрации нового пользователя
app.post("/new-user", async (req, res) => {
  const { name } = req.body;

  if (!name || name.trim().length === 0) {
    return res.status(400).json({
      status: "error",
      message: "Name cannot be empty!",
    });
  }

  const isExist = userState.find((user) => user.name === name);

  if (!isExist) {
    const newUser = {
      id: crypto.randomUUID(),
      name: name,
    };
    userState.push(newUser);

    return res.status(200).json({
      status: "ok",
      user: newUser,
    });
  } else {
    return res.status(409).json({
      status: "error",
      message: "This name is already taken!",
    });
  }
});

const server = http.createServer(app);
const wsServer = new WebSocketServer({ server });

// Функция для рассылки обновлённого списка пользователей
const broadcastUsersUpdate = () => {
  const usersUpdate = JSON.stringify({
    type: "update-users",
    users: userState,
  });

  [...wsServer.clients]
    .filter((client) => client.readyState === WebSocket.OPEN)
    .forEach((client) => client.send(usersUpdate));
};

// Обработка подключения WebSocket
wsServer.on("connection", (ws) => {
  let currentUser = null;

  // Отправляем новому пользователю список пользователей
  ws.send(
    JSON.stringify({
      type: "update-users",
      users: userState,
    })
  );

  // Отправляем историю сообщений
  ws.send(
    JSON.stringify({
      type: "message-history",
      messages: messageHistory,
    })
  );

  ws.on("message", (message) => {
    const receivedMSG = JSON.parse(message);

    // Новый пользователь
    if (receivedMSG.type === "new-user") {
      const { name } = receivedMSG;
      const isExist = userState.find((user) => user.name === name);

      if (!isExist) {
        currentUser = {
          id: crypto.randomUUID(),
          name: name,
        };
        userState.push(currentUser);

        // Обновляем список пользователей для всех клиентов
        broadcastUsersUpdate();
      } else {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "This name is already taken!",
          })
        );
      }
      return;
    }

    // Выход пользователя
    if (receivedMSG.type === "exit") {
      const idx = userState.findIndex((user) => user.name === receivedMSG.name);
      if (idx !== -1) {
        userState.splice(idx, 1);
        broadcastUsersUpdate();
      }
      return;
    }

    // Сообщение от пользователя
    if (receivedMSG.type === "send") {
      const { message, author } = receivedMSG;

      const newMessage = {
        text: message,
        author,
      };

      messageHistory.push(newMessage);

      // Отправляем новое сообщение всем пользователям
      [...wsServer.clients]
        .filter((client) => client.readyState === WebSocket.OPEN)
        .forEach((client) =>
          client.send(
            JSON.stringify({
              type: "new-message",
              message: newMessage,
            })
          )
        );
    }
  });

  ws.on("close", () => {
    if (currentUser) {
      const idx = userState.findIndex((user) => user.id === currentUser.id);
      if (idx !== -1) {
        userState.splice(idx, 1);
        broadcastUsersUpdate();
      }
    }
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () =>
  console.log(`Server has been started on http://localhost:${port}`)
);