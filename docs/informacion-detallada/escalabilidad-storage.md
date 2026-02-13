# Escalabilidad del Storage (y KMS)

Documento que aclara la distribución, separación por rol y estrategias de escalado del storage (y KMS) en un producto SSI a nivel masivo.

---

## 1. ¿Storage y KMS separados por rol?

**Sí.** A nivel masivo, conviene tener storage y KMS específicos para cada rol:

| Rol | Storage | KMS |
|-----|---------|-----|
| **Issuer** | Issuer-Storage | Issuer-KMS |
| **Verifier** | Verifier-Storage | Verifier-KMS |
| **Holder** | Holder-Storage (o local/wallet) | Holder-KMS (o local) |

**Razones**: aislamiento ante compromisos, patrones de acceso distintos, cumplimiento normativo, escalado independiente.

---

## 2. ¿Escalan juntos o por separado?

Depende del tráfico.

### Escalar juntos (infra compartida)

- Issuer y verifier forman **un mismo producto** y el flujo es emisión → verificación con carga correlacionada.
- Un único cluster de storage/KMS que crece con la carga total.
- Más simple de operar.

### Escalar por separado (infra independiente)

- **Tráfico desacoplado**: muchos issuers (gobiernos, universidades) emiten, pocos verifiers (bancos, aerolíneas) verifican, o al revés.
- **Picos en momentos distintos**: emisiones concentradas (ej. matrículas) vs verificaciones repartidas todo el año.
- **Multi-tenant**: varios clientes con volúmenes muy diferentes.
- Cada uno con sus propios recursos y auto-scaling.

### Pregunta clave

**¿Pueden darse picos de emisión sin picos de verificación (o al revés)?**

- **Sí** → escalar por separado.
- **No, van ligados** → escalar juntos está bien.

---

## 3. Patrones de carga por rol

| Rol | Storage | KMS |
|-----|---------|-----|
| **Issuer** | Mucha escritura (cada emisión = varios records). Crecimiento con número de emisiones. | Alta creación de claves (DIDs por invitación). Firma frecuente. |
| **Verifier** | Más lectura que escritura. Crecimiento con número de verificaciones. | Media creación de claves. Menos firma que el issuer. |
| **Holder** | Mixto. Una credencial por cada recibida. | Variable según número de holders y presentaciones. |

---

## 4. Estrategias de escalado

### Storage

| Estrategia | Cuándo |
|------------|--------|
| **Particionamiento** | Multi-tenant: por tenant/agente. |
| **Réplicas de lectura** | Verifier con mucha carga de lectura. |
| **Sharding** | Tablas muy grandes: por rango de IDs o por tenant. |
| **Índices** | Por `type`, `threadId`, `connectionId`, `createdAt`. |
| **Limpieza / TTL** | Records obsoletos (OOB, exchanges completados) para no crecer indefinidamente. |

### KMS

| Estrategia | Cuándo |
|------------|--------|
| **KMS externo** | AWS KMS, HashiCorp Vault, Azure Key Vault con HA. |
| **Cache de claves** | Firma intensiva con los mismos DIDs. |
| **Pools de conexión** | Evitar saturar el KMS. |
| **Reutilizar DIDs** | Menos DIDs efímeros = menos creación de claves = menos latencia y coste. |

### Servicios (issuer, verifier)

| Estrategia | Descripción |
|------------|-------------|
| **Stateless** | Sin estado en proceso; todo en storage y KMS. |
| **Múltiples instancias** | Detrás de load balancer. |
| **Colas** | Picos de carga: procesar emisiones/verificaciones de forma asíncrona. |
| **Pool de conexiones** | A storage y KMS. |

---

## 5. Cuellos de botella típicos

1. **Storage único**: sin réplicas o particiones, se convierte en límite.
2. **KMS**: muchas claves efímeras aumentan latencia y coste.
3. **Did-service**: alto volumen de resoluciones → usar caché (Redis, etc.).
4. **Records sin limpieza**: crecimiento indefinido del storage.

---

## 6. Resumen visual

```
                    Tráfico correlacionado?
                    (emisión ↔ verificación)
                           │
           ┌───────────────┴───────────────┐
           │                               │
          SÍ                              NO
           │                               │
           ▼                               ▼
    ┌─────────────┐                 ┌─────────────────┐
    │ Escalar     │                 │ Escalar         │
    │ juntos      │                 │ por separado    │
    │             │                 │                 │
    │ Storage +   │                 │ Issuer-Storage  │
    │ KMS shared  │                 │ Verifier-Storage│
    │ (por rol)   │                 │ (cada uno su HA) │
    └─────────────┘                 └─────────────────┘
```

---

## 7. Referencias

- `docs/informacion-detallada/distribucion-storage-ssi.md` — Qué guarda cada rol.
- `docs/STORAGE-SERVICE.md` — API y seguridad del storage.
- `docs/informacion-detallada/propuesta-seguridad-storage-holder.md` — Cifrado cliente para holder.
