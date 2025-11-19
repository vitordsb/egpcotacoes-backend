# EGP Cotação - Backend

Backend do Sistema de Cotação para a EGP Indústria e Comércio de Equipamentos Eletrônicos.

## Tecnologias

- **Node.js** com TypeScript
- **Express.js** para servidor HTTP
- **tRPC** para APIs type-safe
- **Driver oficial do MongoDB** para acesso ao banco
- **MongoDB** como banco de dados
- **JWT** para autenticação de fornecedores

## Instalação

### Pré-requisitos

- Node.js 18+
- pnpm
- MongoDB 6.0+

### Passos

1. Clone o repositório e navegue até a pasta do backend:
```bash
cd egp-backend
```

2. Instale as dependências:
```bash
pnpm install
```

3. Configure as variáveis de ambiente:
```bash
cp .env.example .env
# Edite o arquivo .env com suas credenciais
```

4. Certifique-se de que o MongoDB esteja acessível através da string configurada em `DATABASE_URL`.

## Desenvolvimento

Para iniciar o servidor em modo desenvolvimento:
```bash
pnpm dev
```

O servidor estará disponível em `http://localhost:3001`

## Testes

Execute os testes unitários:
```bash
pnpm test
```

## Estrutura do Projeto

```
server/
  ├── _core/          # Código principal do servidor
  │   ├── index.ts    # Arquivo de entrada
  │   ├── router.ts   # Definição das rotas tRPC
  │   └── ...
  ├── db.ts           # Helpers de banco de dados
  ├── pricing.ts      # Lógica de cálculo de preços
  └── *.test.ts       # Testes unitários

shared/
  ├── database.ts     # Tipos compartilhados das coleções MongoDB
  └── types.ts        # Re-exporta tipos e erros
```

## Endpoints Principais

### Autenticação de Fornecedor
- `POST /api/supplier/login` - Login com CNPJ e senha
- `POST /api/supplier/logout` - Logout

### Cotações (Fornecedor)
- `GET /api/supplier/quotations/:id` - Obter dados da cotação
- `POST /api/supplier/quotes` - Salvar preços da cotação

### Administração
- `POST /api/admin/quotations` - Criar nova cotação
- `GET /api/admin/quotations` - Listar cotações
- `GET /api/admin/quotations/:id/summary` - Resumo de preços
- `POST /api/admin/suppliers/password` - Gerar senha para fornecedor

## Variáveis de Ambiente

- `DATABASE_URL` - String de conexão do MongoDB (ex.: mongodb+srv://...)
- `JWT_SECRET` - Chave secreta para assinar tokens JWT
- `ADMIN_LOGIN` - (opcional) login customizado para o administrador (padrão: `egp242622`)
- `ADMIN_PASSWORD` - (opcional) senha customizada do administrador (padrão: `Egpeletrificador40116124000151`)
- `CLIENT_ORIGIN` - (opcional) origem autorizada para o frontend em desenvolvimento (padrão: `http://localhost:5173`)
- `NODE_ENV` - Ambiente (development/production)
- `PORT` - Porta do servidor (padrão: 3001)

## Login do Administrador

O painel administrativo pode ser acessado diretamente pelo frontend com as seguintes credenciais padrão:

- **Login:** `egp242622`
- **Senha:** `Egpeletrificador40116124000151`

Para alterar esses valores basta definir `ADMIN_LOGIN` e `ADMIN_PASSWORD` no arquivo `.env` do backend. Após efetuar o login o sistema cria automaticamente o usuário administrador e mantém a sessão via cookie.

## Autenticação

O sistema usa JWT para autenticar fornecedores. Cada fornecedor recebe:
- CNPJ (identificador único)
- Senha temporária (válida por 14 dias)

Após login bem-sucedido, um token JWT é retornado e deve ser incluído em todas as requisições subsequentes.

## Contribuindo

Para contribuir com o projeto, por favor:
1. Crie uma branch para sua feature
2. Faça commit das suas mudanças
3. Envie um pull request

## Licença

MIT
