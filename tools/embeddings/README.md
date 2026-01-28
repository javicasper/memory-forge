# Memory Forge Embeddings

Sistema de búsqueda semántica para el conocimiento almacenado en CLAUDE.md, AGENTS.md y SKILL.md.

## ¿Por qué embeddings?

### El problema: Context Bloat

Sin embeddings, **todo** el conocimiento se carga en cada sesión:

```
Sesión típica SIN embeddings:
┌─────────────────────────────────────────────────────────────┐
│ CLAUDE.md completo            →  ~2,000 tokens              │
│ 30 skills cargados            →  ~15,000 tokens             │
│ Skills de otros módulos       →  ~8,000 tokens              │
├─────────────────────────────────────────────────────────────┤
│ TOTAL por sesión              →  ~25,000 tokens             │
│ × 50 sesiones/día             →  1,250,000 tokens/día       │
└─────────────────────────────────────────────────────────────┘
```

**Problemas:**
- 💸 Tokens desperdiciados en contexto irrelevante
- 🐌 Respuestas más lentas por contexto grande
- 🔍 Sin búsqueda semántica: "webhook falla" no encuentra "signature verification failed"
- 📚 Límite práctico de ~50 skills antes de que sea inmanejable

### La solución: Búsqueda semántica on-demand

Con embeddings, solo se carga lo **relevante**:

```
Sesión típica CON embeddings:
┌─────────────────────────────────────────────────────────────┐
│ Usuario: "el webhook de stripe falla"                       │
│                                                             │
│ 1. Claude detecta que necesita contexto                     │
│ 2. Llama a search_knowledge("webhook stripe falla")         │
│ 3. Sistema encuentra chunks relevantes (~500 tokens)        │
│ 4. Solo esos chunks se inyectan en contexto                 │
├─────────────────────────────────────────────────────────────┤
│ TOTAL por sesión              →  ~500-2,000 tokens          │
│ Reducción                     →  90-95%                     │
└─────────────────────────────────────────────────────────────┘
```

### Beneficios

| Métrica | Sin Embeddings | Con Embeddings | Mejora |
|---------|----------------|----------------|--------|
| Tokens/sesión | ~25,000 | ~2,000 | **92%** menos |
| Búsqueda | Exacta (keywords) | Semántica | Encuentra sinónimos |
| Skills soportados | ~50 | **Ilimitados** | Sin límite práctico |
| Latencia | Alta (contexto grande) | Baja | Respuestas más rápidas |

### Búsqueda semántica vs exacta

```
Búsqueda EXACTA (sin embeddings):
  Query: "webhook validation error"
  ❌ No encuentra: "Stripe signature verification failed"
  ❌ No encuentra: "Invalid webhook signature"

Búsqueda SEMÁNTICA (con embeddings):
  Query: "webhook validation error"
  ✅ Encuentra: "Stripe signature verification failed" (similitud 0.85)
  ✅ Encuentra: "Invalid webhook signature" (similitud 0.78)
  ✅ Encuentra: "HTTP 400 on webhook endpoint" (similitud 0.72)
```

## Arquitectura

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ CLAUDE.md   │     │  Chunker    │     │  SQLite DB  │     │   Search    │
│ SKILL.md    │ ──► │  (parseo    │ ──► │  (chunks +  │ ──► │  (cosine    │
│ AGENTS.md   │     │  semántico) │     │  embeddings)│     │  similarity)│
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │Transformers │
                    │.js (local)  │
                    │ 22MB modelo │
                    └─────────────┘
```

**Componentes:**
- **Chunker**: Divide archivos en chunks semánticos (frontmatter, triggers, solution, etc.)
- **Embeddings**: Genera vectores con Transformers.js (all-MiniLM-L6-v2, 384 dimensiones)
- **SQLite**: Almacena chunks y embeddings localmente
- **Search**: Búsqueda por similitud coseno con ranking por prioridad

**Características:**
- 🔒 **100% local** - Sin API keys, sin enviar datos a terceros
- 📦 **Zero dependencies externas** - Solo Node.js
- 🧠 **Memoria con olvido** - Sistema LRU que olvida lo que no se usa
- ⚡ **Modelo pequeño** - 22MB, se descarga una vez

## Instalación

### Opción 1: Instalación rápida con npm (recomendada)

```bash
# Añadir a Claude Code (en el directorio de tu proyecto)
claude mcp add memory-forge -- npx -y -p @memory-forge/embeddings memory-forge-mcp
```

¡Listo! El MCP server se configura automáticamente y usa el directorio actual como raíz del proyecto.

### Opción 2: Instalación desde source

```bash
# 1. Clonar e instalar
cd /ruta/a/memory-forge/tools/embeddings
npm install
npm run build

# 2. Añadir a Claude Code
claude mcp add memory-forge -- node /ruta/completa/a/memory-forge/tools/embeddings/dist/mcp-server.js
```

### Opción 3: Configuración manual

Si prefieres editar la configuración manualmente, añade a `~/.claude.json`:

```json
{
  "mcpServers": {
    "memory-forge": {
      "command": "npx",
      "args": ["-y", "@memory-forge/embeddings"]
    }
  }
}
```

O para instalación local:

```json
{
  "mcpServers": {
    "memory-forge": {
      "command": "node",
      "args": ["/ruta/completa/a/memory-forge/tools/embeddings/dist/mcp-server.js"]
    }
  }
}
```

### Configuración por proyecto

Para compartir la configuración con tu equipo, usa scope de proyecto:

```bash
claude mcp add --scope project memory-forge -- npx -y -p @memory-forge/embeddings memory-forge-mcp
```

Esto crea `.mcp.json` en la raíz del proyecto (añádelo a git).

### Verificar instalación

```bash
# Ver MCPs instalados
claude mcp list

# En Claude Code, deberías tener estos tools:
# - search_knowledge
# - index_knowledge
# - knowledge_stats
# - forget_knowledge
```

## Uso

### MCP Server (recomendado para Claude Code)

Claude usa automáticamente los tools cuando detecta que necesita contexto:

```
Usuario: "El webhook de Stripe da error 400"

Claude: [Internamente llama a search_knowledge]
        "Encontré un skill relevante. El problema común es que
         el body se parsea antes de verificar la firma..."
```

### CLI (para otros CLIs o uso manual)

```bash
# Indexar conocimiento del proyecto
memory-forge index

# Buscar
memory-forge query "webhook signature error"
memory-forge query "testing patterns" --limit 3 --json

# Ver estadísticas de memoria
memory-forge memory

# Olvidar memorias antiguas (no usadas en 30 días)
memory-forge forget --max-age 30

# Mantener máximo 100 archivos
memory-forge forget --max-files 100 --dry-run
```

## Sistema de memoria con olvido

El sistema simula memoria humana: lo que no se usa se olvida.

### Importancia (1-10)

Cuando Memory Forge crea un skill, el LLM decide su importancia:

```yaml
---
name: critical-auth-pattern
importance: 9  # Crítico, nunca olvidar
---
```

| Valor | Significado | Se borra |
|-------|-------------|----------|
| 9-10 | Crítico | ❌ Nunca (protegido) |
| 6-8 | Muy importante | ❌ Nunca (protegido) |
| 4-5 | Útil (default) | ✅ Si no se usa |
| 1-3 | Efímero | ✅ Primero en borrarse |

### Algoritmo de olvido

```
Al decidir qué olvidar:
1. Archivos con importance >= 8 → NUNCA se borran
2. Del resto, ordenar por:
   a. Menor importancia primero
   b. Menor access_count (uso)
   c. Más antiguo last_accessed
3. Borrar según política (max_age o max_files)
```

### Ejemplo

```
Estado de memoria:
├── CLAUDE.md (importance: 10, accesos: 50) → PROTEGIDO
├── auth-pattern.md (importance: 8, accesos: 30) → PROTEGIDO
├── stripe-webhook.md (importance: 5, accesos: 10) → Candidato
├── temp-fix.md (importance: 2, accesos: 1) → Se borra primero
└── old-workaround.md (importance: 4, accesos: 0) → Se borra segundo
```

## Chunking Strategy

### SKILL.md → Chunks semánticos

| Chunk | Prioridad | Contenido |
|-------|-----------|-----------|
| frontmatter | 10 | Nombre, descripción, triggers |
| trigger | 9 | Condiciones de activación, errores |
| problem | 8 | Descripción del problema |
| solution | 7 | Pasos de solución |
| verification | 5 | Cómo verificar |
| notes | 4 | Notas adicionales |

### CLAUDE.md → Por secciones

- Divide por H2 (`## Sección`)
- Si sección > 500 tokens, subdivide por H3
- Preserva contexto de jerarquía

## Tests

```bash
npm test              # Ejecutar tests
npm run test:watch    # Watch mode
npm run test:coverage # Con coverage
```

## Estructura del proyecto

```
tools/embeddings/
├── src/
│   ├── index.ts        # CLI entry point
│   ├── mcp-server.ts   # MCP Server para Claude Code
│   ├── chunker.ts      # Parseo de archivos → chunks
│   ├── embeddings.ts   # Generación con Transformers.js
│   ├── db.ts           # SQLite + operaciones de memoria
│   ├── search.ts       # Búsqueda semántica
│   ├── sync.ts         # Detección de cambios
│   └── types.ts        # Tipos TypeScript
├── tests/
│   ├── chunker.test.ts
│   ├── db.test.ts
│   ├── embeddings.test.ts
│   └── search.test.ts
├── package.json
└── tsconfig.json
```

## Release y publicación (para mantenedores)

El release es **automático** vía GitHub Actions cuando se crea un tag.

### Crear un nuevo release

```bash
# 1. Asegúrate de estar en main con todo commiteado
git checkout main
git pull

# 2. Crear tag de versión
git tag v1.0.0
git push origin v1.0.0
```

**GitHub Actions automáticamente:**
1. ✅ Ejecuta tests
2. ✅ Compila el proyecto
3. ✅ Publica en npm
4. ✅ Crea GitHub Release con changelog

### Configuración requerida (una vez)

1. **NPM Token**: En GitHub repo → Settings → Secrets → `NPM_TOKEN`
   - Crear en npmjs.com → Access Tokens → Generate New Token (Automation)

2. **Scope de npm**: Crear organización `@memory-forge` en npmjs.com
   - O cambiar el nombre del paquete en `package.json`

### Versiones

Seguimos [SemVer](https://semver.org/):
- `v1.0.0` → Release estable
- `v1.1.0` → Nueva funcionalidad (backward compatible)
- `v1.0.1` → Bug fix
- `v2.0.0-beta.1` → Pre-release (no se marca como latest en npm)

## Troubleshooting

### "No index found"

```bash
memory-forge index  # Crear índice primero
```

### MCP server no aparece en Claude Code

1. Verifica rutas absolutas en la configuración
2. Reinicia Claude Code completamente
3. Revisa logs: `~/.claude/logs/`

### Modelo tarda en cargar

La primera vez descarga el modelo (~22MB). Después usa caché local.

```bash
memory-forge preload  # Pre-descargar modelo
```

### Error de permisos en SQLite

El directorio `.memory-forge/` debe ser escribible:

```bash
chmod 755 .memory-forge
```
