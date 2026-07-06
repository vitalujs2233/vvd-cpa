import asyncio
from sqlalchemy import text
from backend.database import engine


async def check_database_connection():
    print("=== ТЕСТ ПОДКЛЮЧЕНИЯ К SUPABASE POSTGRESQL ===")
    print("Запуск асинхронного пинга базы данных...")
    
    try:
        # Пытаемся открыть асинхронное соединение с базой данных
        async with engine.connect() as conn:
            # Выполняем простейший системный запрос
            result = await conn.execute(text("SELECT 1;"))
            value = result.scalar()
            
            if value == 1:
                print("\n[УСПЕХ] Бэкенд VVD CPA успешно подключился к Supabase!")
                print("Связь с PostgreSQL установлена без ошибок. Асинхронный пул активен.\n")
            else:
                print("\n[ПРЕДУПРЕЖДЕНИЕ] Подключение установлено, но проверочный запрос вернул некорректный ответ.\n")
                
    except Exception as error:
        print("\n[ОШИБКА] Не удалось подключиться к Supabase PostgreSQL.")
        print(f"Детали ошибки компилятора/соединения: {error}")
        print("\nПожалуйста, проверьте правильность DATABASE_URL в файле backend/.env")
        print("Убедитесь, что пароль, имя проекта и порт указаны верно, а префикс заменен на postgresql+asyncpg://\n")
        
    finally:
        # Корректно закрываем движок и освобождаем все ресурсы пула соединений
        await engine.dispose()
        print("Тестирование завершено. Движок базы данных выгружен.")


if __name__ == "__main__":
    # Запускаем асинхронное событие проверки связи
    asyncio.run(check_database_connection())
