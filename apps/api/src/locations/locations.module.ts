import { Module } from "@nestjs/common";
import { APP_ENV, type AppEnv } from "../config/env";
import { GEOCODER, type Geocoder } from "./geocoder";
import { DisabledGeocoder, NominatimGeocoder } from "./nominatim.geocoder";
import { LocationsController } from "./locations.controller";

@Module({
  controllers: [LocationsController],
  providers: [
    {
      provide: GEOCODER,
      inject: [APP_ENV],
      useFactory: (env: AppEnv): Geocoder =>
        env.GEOCODER_PROVIDER === "nominatim" ? new NominatimGeocoder(env) : new DisabledGeocoder()
    }
  ],
  exports: [GEOCODER]
})
export class LocationsModule {}
