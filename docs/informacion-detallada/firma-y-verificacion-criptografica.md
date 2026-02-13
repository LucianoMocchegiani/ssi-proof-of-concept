# Firma y verificación criptográfica

Explicación del proceso de firma con clave privada y verificación con clave pública en el contexto de SSI/Credo.

---

## Regla general

- **Clave privada** → firmar (solo la tiene el dueño)
- **Clave pública** → verificar la firma (puede conocerla cualquiera)

No se puede firmar con la pública ni verificar con la privada.

---

## Proceso de firma

```
1. Issuer tiene un mensaje (ej: credencial, Connection Response)
2. Issuer usa su clave PRIVADA → genera una "firma" (bytes criptográficos)
3. Issuer envía: mensaje + firma
```

La firma es un valor que solo puede generarse con esa clave privada.

---

## Proceso de verificación

```
4. Receptor (holder/verifier) recibe: mensaje + firma
5. Receptor resuelve el DID del issuer → obtiene el didDocument → obtiene la clave PÚBLICA
6. Receptor ejecuta: verify(mensaje, firma, clavePública)
7. Si la firma es válida → el mensaje fue firmado por quien controla esa clave privada
8. Si la firma no es válida → el mensaje fue alterado o la firma no corresponde a ese DID
```

---

## Pasos de la verificación

| Paso | Quién | Qué pasa |
|------|-------|----------|
| 1 | Receptor | Obtiene la clave pública del issuer (didDocument o similar) |
| 2 | Receptor | Pasa al algoritmo: mensaje, firma y clave pública |
| 3 | Algoritmo | Comprueba si la firma coincide con el mensaje y la clave pública |
| 4 | Algoritmo | Devuelve: válida o inválida |

La verificación solo usa la clave pública. Si la firma es correcta, se sabe que solo quien tiene la clave privada pudo haberla generado.

---

## Fundamento matemático (curvas elípticas)

Las claves pública y privada se obtienen a partir de los mismos parámetros (curva elíptica, punto base G), pero con operaciones diferentes:

- **Clave privada (d)**: número secreto generado al azar.
- **Clave pública (P)**: resultado de una operación pública: **P = d · G** (multiplicación escalar en la curva; G es un punto fijo definido por el estándar de la curva).

**Al firmar:**
- Se calcula un valor a partir del mensaje y de d.
- Ese valor es la firma.

**Al verificar:**
- Se usa la firma, el mensaje y la clave pública.
- Existe una ecuación matemática que solo se cumple si la firma se generó con la d correspondiente a esa clave pública.
- Esa ecuación se puede comprobar solo con la clave pública; no hace falta conocer d.

---

## Por qué funciona

La clave pública y la privada forman un **par**. La firma es el resultado de un cálculo con la clave privada. Con la clave pública se puede comprobar que esa firma es correcta **sin** conocer la clave privada.

**Resumen**: Privada → firmar. Pública → verificar. El receptor nunca necesita la clave privada.
