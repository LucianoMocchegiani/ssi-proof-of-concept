# Cifrado y descifrado criptográfico

Explicación del proceso de cifrado asimétrico con X25519 en el contexto de DIDComm y SSI.

---

## Regla general

- **Clave pública del destinatario** → cifrar (cualquiera puede cifrar para él)
- **Clave privada del destinatario** → descifrar (solo el destinatario puede leer)

No se puede descifrar con la pública ni cifrar con la privada (para este uso).

---

## Proceso de cifrado

```
1. Emisor tiene un mensaje para el receptor (ej: credencial, Connection Request)
2. Emisor resuelve el DID del receptor → obtiene su didDocument → obtiene su clave PÚBLICA
3. Emisor usa la clave pública del receptor → cifra el mensaje
4. Emisor envía: mensaje cifrado (ciphertext)
```

Solo quien tiene la clave privada correspondiente puede descifrar.

---

## Proceso de descifrado

```
5. Receptor recibe: mensaje cifrado
6. Receptor usa su clave PRIVADA → descifra el mensaje
7. Si la clave es la correcta → obtiene el mensaje en claro
8. Si no → el descifrado falla (datos corruptos o clave incorrecta)
```

---

## Pasos del cifrado (emisor → receptor)

| Paso | Quién | Qué pasa |
|------|-------|----------|
| 1 | Emisor | Resuelve el DID del receptor y obtiene su clave pública |
| 2 | Emisor | Ejecuta: encrypt(mensaje, clavePúblicaDelReceptor) |
| 3 | Emisor | Envía el ciphertext por el canal |

| Paso | Quién | Qué pasa |
|------|-------|----------|
| 4 | Receptor | Recibe el ciphertext |
| 5 | Receptor | Ejecuta: decrypt(ciphertext, suClavePrivada) |
| 6 | Receptor | Obtiene el mensaje en claro |

---

## Fundamento matemático (curvas elípticas)

Las claves pública y privada forman un par matemáticamente ligado:

- **Clave privada (d)**: número secreto generado al azar.
- **Clave pública (P)**: **P = d · G** (multiplicación escalar en la curva; G es el punto base definido por el estándar).

**Al cifrar:**
- Se usa la clave pública del destinatario (P) para derivar un secreto compartido o una clave de sesión.
- El mensaje se cifra con esa clave. Solo quien tiene la d correspondiente puede derivar el mismo secreto.

**Al descifrar:**
- Con la clave privada (d) se deriva el mismo secreto compartido.
- Ese secreto permite descifrar el mensaje. Sin d, no hay forma práctica de obtener el secreto a partir de P.

La operación de cifrado con P es reversible solo con d; recuperar d a partir de P (logaritmo discreto) es computacionalmente inviable.

---

## Por qué funciona

Con la clave pública se puede cifrar, pero no descifrar. La clave privada es la única que puede revertir el cifrado. Aunque alguien intercepte el mensaje cifrado y tenga la clave pública, no puede obtener el contenido sin la clave privada.

**Resumen**: Pública del otro → cifras para él. Tu privada → descifras lo que cifraron para ti.

---

## En DIDComm

- Issuer cifra el mensaje para el holder usando la clave pública del holder (de su didDocument).
- Holder descifra con su clave privada.
- Holder cifra la respuesta para el issuer usando la clave pública del issuer.
- Issuer descifra con su clave privada.

Cada uno usa la **pública del otro** para cifrar y su **privada** para descifrar lo que le envían.
