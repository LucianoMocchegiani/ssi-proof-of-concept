# Autenticación por firma (prueba de posesión del DID)

Explicación de cómo se demuestra "soy el holder del DID X" firmando un challenge con la clave privada.

---

## ¿Qué es el challenge?

Un **challenge** (desafío) es un valor aleatorio o impredecible (nonce, bytes aleatorios) que el verifier genera y envía al holder. El holder debe firmarlo con su clave privada y devolver la firma. Si el holder pudiera elegir el valor, podría reutilizar una firma anterior (replay attack). Al ser aleatorio y nuevo cada vez, el verifier asegura que la prueba es reciente y específica para esa interacción.

---

## Regla general

- **Clave privada** → firmar el challenge (solo el dueño del DID puede)
- **Clave pública** → verificar que la firma es válida (cualquiera puede comprobar)

Es el mismo mecanismo que firma/verificación, aplicado a un flujo de autenticación.

---

## Proceso de autenticación

```
1. Verifier (o issuer) quiere comprobar: "¿Este sujeto controla el DID X?"
2. Verifier genera un challenge (número aleatorio o nonce)
3. Verifier envía el challenge al holder
4. Holder firma el challenge con su clave PRIVADA (la del DID X)
5. Holder devuelve la firma al verifier
6. Verifier resuelve el DID X → obtiene la clave PÚBLICA del didDocument
7. Verifier ejecuta: verify(challenge, firma, clavePública)
8. Si la firma es válida → el holder controla ese DID
9. Si no → el holder no puede demostrar control del DID
```

---

## Pasos detallados

| Paso | Quién | Qué pasa |
|------|-------|----------|
| 1 | Verifier | Genera un challenge (bytes aleatorios) |
| 2 | Verifier | Envía el challenge al holder |
| 3 | Holder | Firma el challenge con su clave privada del DID |
| 4 | Holder | Devuelve la firma al verifier |
| 5 | Verifier | Obtiene la clave pública del DID (didDocument) |
| 6 | Verifier | Verifica: firma válida = holder controla el DID |

---

## Por qué funciona

Solo quien tiene la clave privada puede generar una firma válida del challenge. Si la firma verifica correctamente con la clave pública del DID, entonces el holder demostró posesión de la clave privada = control del DID.

---

## Dónde se usa

- **Prueba de presentación**: El verifier pide al holder que demuestre que controla el subject de la credencial antes de aceptar la presentación.
- **DID auth**: Probar que eres quien dice ser en un handshake o flujo de autenticación.
- **Connection handshake**: Ambos agentes firman mensajes para demostrar control de sus DIDs.

---

## Comparación con cifrado

| Firma (autenticación) | Cifrado |
|----------------------|---------|
| **Firmas** con tu privada | **Cifras** con la pública del otro |
| **Verifican** con tu pública | **Descifras** con tu privada |
| Prueba quién eres | Protege el contenido del mensaje |
