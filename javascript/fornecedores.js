const API = "/api/fornecedores";
const $ = (id) => document.getElementById(id);

const corpo = $("listaItens");
const campoBusca = $("busca");
const dialogoCadastro = $("dialogoCadastro");
const formulario = $("formCadastro");
const botaoSalvar = $("botaoSalvar");
const erroGeral = $("erroGeral");
const dialogoExcluir = $("dialogoExcluir");
const COLUNAS = 5;
const CAMPOS = ["nome", "telefone", "email"];

let fornecedores = [];
let idParaExcluir = null;

/* ---------- Utilitários ---------- */
function escaparHTML(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    })[c]);
}
function normalizar(texto) {
    return String(texto ?? "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
function plural(n, singular, pluralTexto) {
    return `${n} ${n === 1 ? singular : pluralTexto}`;
}
function avisar(texto, tipo = "sucesso") {
    const aviso = document.createElement("div");
    aviso.className = `aviso ${tipo === "erro" ? "erro" : ""}`;
    aviso.textContent = texto;
    $("avisos").appendChild(aviso);
    setTimeout(() => aviso.remove(), tipo === "erro" ? 6000 : 3500);
}
async function chamarAPI(url, opcoes) {
    let resposta;
    try {
        resposta = await fetch(url, opcoes);
    } catch {
        throw new Error("Não foi possível conectar ao servidor. Confira se o Flask está rodando.");
    }
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(dados.erro || "Algo deu errado. Tente de novo.");
    return dados;
}
function enviarJSON(metodo, corpoJSON) {
    return { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpoJSON) };
}

/* ---------- Lista ---------- */
function linhaVazia(html) {
    return `<tr class="vazio-linha"><td colspan="${COLUNAS}" class="vazio">${html}</td></tr>`;
}

function atualizarResumo() {
    const n = fornecedores.length;
    const incompletos = fornecedores.filter((f) => !f.telefone || !f.email).length;
    if (n === 0) {
        $("tituloPagina").textContent = "Nenhum fornecedor cadastrado";
        $("subtituloPagina").textContent = "Eles aparecem aqui quando você cadastra um produto, ou pelo botão “Novo fornecedor”.";
        return;
    }
    $("tituloPagina").textContent = plural(n, "fornecedor cadastrado", "fornecedores cadastrados");
    $("subtituloPagina").textContent = incompletos === 0
        ? "Todos com telefone e e-mail preenchidos."
        : `${plural(incompletos, "fornecedor está sem telefone ou e-mail", "fornecedores estão sem telefone ou e-mail")}. Complete o cadastro para facilitar o contato.`;
}

function renderizar() {
    atualizarResumo();
    const termo = normalizar(campoBusca.value.trim());
    const lista = fornecedores.filter((f) =>
        !termo || [f.nome, f.telefone, f.email].some((v) => normalizar(v).includes(termo)));
    $("contador").textContent = fornecedores.length ? `Mostrando ${lista.length} de ${fornecedores.length}.` : "";

    if (fornecedores.length === 0) {
        corpo.innerHTML = linhaVazia(`<strong>Nenhum fornecedor ainda</strong>Cadastre o primeiro para começar.<br>
            <button type="button" class="primario" data-abrir-novo>+ Novo fornecedor</button>`);
        return;
    }
    if (lista.length === 0) {
        corpo.innerHTML = linhaVazia(`<strong>Nenhum fornecedor encontrado</strong>Tente outro termo.<br>
            <button type="button" class="secundario" data-limpar>Limpar busca</button>`);
        return;
    }

    corpo.innerHTML = lista.map((f) => {
        const nome = escaparHTML(f.nome);
        const digitos = String(f.telefone ?? "").replace(/\D/g, "");
        const telefone = f.telefone
            ? `<a class="contato" href="tel:${digitos}">${escaparHTML(f.telefone)}</a>`
            : '<span class="faltando">Não informado</span>';
        const email = f.email
            ? `<a class="contato" href="mailto:${escaparHTML(f.email)}">${escaparHTML(f.email)}</a>`
            : '<span class="faltando">Não informado</span>';
        return `
        <tr data-id="${f.id_fornecedor}">
            <td class="nome">${nome}</td>
            <td data-label="Telefone">${telefone}</td>
            <td data-label="E-mail">${email}</td>
            <td data-label="Produtos" class="numero">${f.produtos}</td>
            <td class="acoes-celula">
                <div class="acoes-linha">
                    <button type="button" class="editar" data-acao="editar" aria-label="Editar ${nome}">Editar</button>
                    <button type="button" class="excluir" data-acao="excluir" aria-label="Excluir ${nome}">Excluir</button>
                </div>
            </td>
        </tr>`;
    }).join("");
}

async function carregar() {
    corpo.innerHTML = Array.from({ length: 3 }, () =>
        `<tr class="esqueleto" aria-hidden="true">${"<td><span></span></td>".repeat(COLUNAS)}</tr>`).join("");
    try {
        fornecedores = await chamarAPI(API);
        renderizar();
    } catch (erro) {
        $("subtituloPagina").textContent = erro.message;
        corpo.innerHTML = linhaVazia(`<strong>Falha ao carregar</strong>${escaparHTML(erro.message)}<br>
            <button type="button" class="secundario" data-recarregar>Tentar de novo</button>`);
    }
}

/* ---------- Formulário ---------- */
function limparErros() {
    erroGeral.hidden = true;
    erroGeral.textContent = "";
    formulario.querySelectorAll(".campo").forEach((c) => c.classList.remove("invalido"));
    formulario.querySelectorAll(".erro-campo").forEach((e) => (e.textContent = ""));
    formulario.querySelectorAll("input").forEach((i) => i.removeAttribute("aria-invalid"));
}
function erroNoCampo(id, mensagem) {
    $(id).closest(".campo").classList.add("invalido");
    $(id).setAttribute("aria-invalid", "true");
    $(`erro-${id}`).textContent = mensagem;
}

function abrirFormulario(item = null) {
    formulario.reset();
    limparErros();
    $("itemId").value = item ? item.id_fornecedor : "";
    $("tituloDialogo").textContent = item ? "Editar fornecedor" : "Novo fornecedor";
    botaoSalvar.textContent = item ? "Salvar alterações" : "Cadastrar fornecedor";
    if (item) CAMPOS.forEach((c) => ($(c).value = item[c] ?? ""));
    dialogoCadastro.showModal();
    $("nome").focus();
}

function validar() {
    let primeiro = null;
    const falhar = (campo, msg) => { erroNoCampo(campo, msg); primeiro ??= campo; };

    if (!$("nome").value.trim()) falhar("nome", "Informe o nome do fornecedor.");

    const telefone = $("telefone").value.trim();
    const digitos = telefone.replace(/\D/g, "");
    if (telefone && (digitos.length < 10 || digitos.length > 13)) {
        falhar("telefone", "Use DDD e número, como (19) 99999-9999.");
    }
    const email = $("email").value.trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        falhar("email", "Use o formato nome@exemplo.com.");
    }
    if (primeiro) $(primeiro).focus();
    return !primeiro;
}

formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    limparErros();
    if (!validar()) return;

    const id = $("itemId").value;
    const dados = { nome: $("nome").value.trim(), telefone: $("telefone").value.trim(), email: $("email").value.trim() };
    const rotulo = botaoSalvar.textContent;
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Salvando…";
    try {
        const resultado = await chamarAPI(id ? `${API}/${id}` : API, enviarJSON(id ? "PUT" : "POST", dados));
        dialogoCadastro.close();
        avisar(resultado.mensagem);
        await carregar();
    } catch (erro) {
        erroGeral.textContent = erro.message;
        erroGeral.hidden = false;
    } finally {
        botaoSalvar.disabled = false;
        botaoSalvar.textContent = rotulo;
    }
});

/* ---------- Exclusão ---------- */
function pedirExclusao(f) {
    idParaExcluir = f.id_fornecedor;
    const bloqueado = f.produtos > 0;
    $("tituloExcluir").textContent = bloqueado ? "Não é possível excluir" : "Excluir fornecedor?";
    $("textoExcluir").textContent = bloqueado
        ? `“${f.nome}” fornece ${plural(f.produtos, "produto", "produtos")}. Troque o fornecedor desses produtos na página de estoque antes de excluir.`
        : `“${f.nome}” será removido da lista. Essa ação não pode ser desfeita.`;
    $("confirmarExclusao").hidden = bloqueado;
    $("cancelarExclusao").textContent = bloqueado ? "Entendi" : "Cancelar";
    dialogoExcluir.showModal();
}

$("confirmarExclusao").addEventListener("click", async () => {
    const id = idParaExcluir;
    dialogoExcluir.close();
    try {
        const resultado = await chamarAPI(`${API}/${id}`, { method: "DELETE" });
        avisar(resultado.mensagem);
        await carregar();
    } catch (erro) {
        avisar(erro.message, "erro");
    }
});
$("cancelarExclusao").addEventListener("click", () => dialogoExcluir.close());

/* ---------- Eventos ---------- */
$("botaoNovo").addEventListener("click", () => abrirFormulario());
$("fecharDialogo").addEventListener("click", () => dialogoCadastro.close());
$("botaoCancelar").addEventListener("click", () => dialogoCadastro.close());
[dialogoCadastro, dialogoExcluir].forEach((d) =>
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));
campoBusca.addEventListener("input", renderizar);

corpo.addEventListener("click", (evento) => {
    const alvo = evento.target.closest("button");
    if (!alvo) return;
    if (alvo.hasAttribute("data-abrir-novo")) return abrirFormulario();
    if (alvo.hasAttribute("data-recarregar")) return carregar();
    if (alvo.hasAttribute("data-limpar")) { campoBusca.value = ""; return renderizar(); }

    const linha = alvo.closest("tr[data-id]");
    if (!linha) return;
    const item = fornecedores.find((f) => f.id_fornecedor === Number(linha.dataset.id));
    if (alvo.dataset.acao === "editar") abrirFormulario(item);
    else if (alvo.dataset.acao === "excluir") pedirExclusao(item);
});

carregar();