import { IsOptional, IsInt, Min } from 'class-validator'

/** DTO para POST /random — generar bytes aleatorios */
export class RandomDto {
  /** Cantidad de bytes aleatorios a generar (default 32) */
  @IsOptional()
  @IsInt()
  @Min(1)
  length?: number
}
