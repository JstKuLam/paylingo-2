plugins {
    // Trick gradle to resolve these plugin versions globally
    kotlin("multiplatform") version "1.9.23" apply false
    kotlin("plugin.serialization") version "1.9.23" apply false
    id("com.android.application") version "8.2.2" apply false
    id("com.android.library") version "8.2.2" apply false
    id("app.cash.sqldelight") version "2.0.1" apply false
}
