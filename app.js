const express = require("express");
const path = require("path");
const session = require("express-session");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient(); 

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: "biblioteca-secreta",
    resave: false,
    saveUninitialized: false,
  })
);

function auth(req, res, next) {
  if (!req.session.user) return res.redirect("/");
  next();
}

app.get("/", (req, res) => {
  const erro = req.session.erro;
  req.session.erro = null;
  res.render("login", { erro });
});

app.post("/login", async (req, res) => {
  const { usuario, senha } = req.body;

  if (usuario === "administrador@gmail.com" && senha === "1") {
    req.session.user = {
      id: 0,
      nome: "Super Administrador",
      email: usuario,
      tipo: "admin",
    };
    return res.redirect("/livros");
  }

  const user = await prisma.usuarios.findFirst({
    where: { email: usuario, senha },
  });

  if (!user) {
    req.session.erro = "E-mail ou senha incorretos!";
    return res.redirect("/");
  }

  req.session.user = { ...user, tipo: "usuario" };
  res.redirect("/inicio");
});

app.get("/cadastro", (req, res) => {
  const erro = req.session.erro;
  req.session.erro = null;
  res.render("cadastro", { erro });
});

app.post("/cadastro", async (req, res) => {
  const { nome, email, senha } = req.body;

  try {
    await prisma.usuarios.create({
      data: { nome, email, senha },
    });

    req.session.erro = "Usuário cadastrado!";
    res.redirect("/");
  } catch (err) {
    req.session.erro = "Erro ao cadastrar.";
    res.redirect("/cadastro");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

app.get("/inicio", auth, async (req, res) => {
  const ultimos = await prisma.livros.findMany({
    orderBy: { id: "desc" },
    take: 8,
  });

  res.render("index", { usuario: req.session.user, ultimos });
});

app.get("/buscar", auth, async (req, res) => {
  const termo = req.query.q.trim();

  const livros = await prisma.livros.findMany({
    where: {
      OR: [
        { nome: { contains: termo } },
        { autor: { contains: termo } },
        { categoria: { contains: termo } },
      ],
    },
  });

  res.render("categoria", {
    livros,
    categoria: "Resultado da Busca",
  });
});

app.get("/livros", auth, async (req, res) => {
  if (req.session.user.tipo !== "admin") return res.send("Acesso negado.");

  const livros = await prisma.livros.findMany({
    orderBy: { id: "desc" },
  });

  res.render("livros", { livros });
});

app.post("/livros", auth, async (req, res) => {
  const { nome, autor, capa, categoria } = req.body;

  await prisma.livros.create({
    data: { nome, autor, capa, categoria },
  });

  res.redirect("/livros");
});

app.get("/livros/:id", auth, async (req, res) => {
  const livro = await prisma.livros.findUnique({
    where: { id: Number(req.params.id) },
  });

  res.render("detalhe", { livro });
});

app.get("/livros/editar/:id", auth, async (req, res) => {
  if (req.session.user.tipo !== "admin") return res.send("Acesso negado.");

  const livro = await prisma.livros.findUnique({
    where: { id: Number(req.params.id) },
  });

  res.render("editar", { livro });
});

app.post("/livros/editar/:id", auth, async (req, res) => {
  if (req.session.user.tipo !== "admin") return res.send("Acesso negado.");

  const { nome, autor, capa, categoria } = req.body;

  await prisma.livros.update({
    where: { id: Number(req.params.id) },
    data: { nome, autor, capa, categoria },
  });

  res.redirect("/livros");
});

app.get("/livros/excluir/:id", auth, async (req, res) => {
  await prisma.livros.delete({
    where: { id: Number(req.params.id) },
  });

  res.redirect("/livros");
});

app.get("/romance", auth, async (req, res) => {
  const livros = await prisma.livros.findMany({
    where: { categoria: "romance" },
  });

  res.render("categoria", { livros, categoria: "Romance" });
});

app.get("/ficcao", auth, async (req, res) => {
  const livros = await prisma.livros.findMany({
    where: { categoria: "ficcao" },
  });

  res.render("categoria", { livros, categoria: "Ficção Científica" });
});

app.get("/infantil", auth, async (req, res) => {
  const livros = await prisma.livros.findMany({
    where: { categoria: "infantil" },
  });

  res.render("categoria", { livros, categoria: "Infantil" });
});

app.post("/alugar/:id", auth, async (req, res) => {
  const id = Number(req.params.id);
  const dias = parseInt(req.body.dias);

  const livro = await prisma.livros.findUnique({ where: { id } });

  if (livro.alugado === 1) {
    return res.send("Este livro já está alugado.");
  }

  const data = new Date();
  data.setDate(data.getDate() + dias);
  const devolucao = data.toLocaleDateString("pt-BR");

  await prisma.livros.update({
    where: { id },
    data: {
      alugado: 1,
      usuarioAlugou: req.session.user.nome,
      dataDevolucao: devolucao,
    },
  });

  res.redirect("/livros/" + id);
});

app.post("/devolver/:id", auth, async (req, res) => {
  await prisma.livros.update({
    where: { id: Number(req.params.id) },
    data: {
      alugado: 0,
      usuarioAlugou: null,
      dataDevolucao: null,
    },
  });

  res.redirect("/alugados");
});

app.get("/alugados", auth, async (req, res) => {
  const livros = await prisma.livros.findMany({
    where: { alugado: 1, usuarioAlugou: req.session.user.nome },
  });

  res.render("alugados", { livros });
});

app.get("/admin/usuarios", auth, async (req, res) => {
  if (req.session.user.tipo !== "admin") return res.send("Acesso negado.");

  const dados = await prisma.usuarios.findMany({
    include: {
      livros_usuarioAlugouTolivros: true,
    },
  });

  res.render("usuariosAdmin", { dados });
});

//  API 

app.get("/api/livros", async (req, res) => {
  const livros = await prisma.livros.findMany();
  res.json(livros);
});

app.get("/api/livros/:id", async (req, res) => {
  const livro = await prisma.livros.findUnique({
    where: { id: Number(req.params.id) },
  });

  if (!livro) return res.json({ erro: "Livro não encontrado" });
  res.json(livro);
});

app.post("/api/login", async (req, res) => {
  const { email, senha } = req.body;

  const user = await prisma.usuarios.findFirst({
    where: { email, senha },
  });

  if (!user) return res.json({ erro: "Credenciais inválidas" });

  res.json({
    mensagem: "Login bem-sucedido",
    usuario: user,
  });
});

app.post("/api/alugar/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { usuario, dias } = req.body;

  const livro = await prisma.livros.findUnique({ where: { id } });

  if (!livro || livro.alugado === 1)
    return res.json({ erro: "Livro já alugado" });

  const data = new Date();
  data.setDate(data.getDate() + parseInt(dias));
  const devolucao = data.toLocaleDateString("pt-BR");

  await prisma.livros.update({
    where: { id },
    data: {
      alugado: 1,
      usuarioAlugou: usuario,
      dataDevolucao: devolucao,
    },
  });

  res.json({
    mensagem: "Livro alugado com sucesso!",
    devolucao,
  });
});

app.post("/api/devolver/:id", async (req, res) => {
  await prisma.livros.update({
    where: { id: Number(req.params.id) },
    data: {
      alugado: 0,
      usuarioAlugou: null,
      dataDevolucao: null,
    },
  });

  res.json({ mensagem: "Livro devolvido com sucesso!" });
});

app.listen(3000, () =>
  console.log("Servidor rodando com Prisma na porta 3000")
);
