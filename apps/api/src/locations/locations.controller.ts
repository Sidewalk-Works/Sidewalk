import { Controller, Get, Query } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, IsString, Length, Max, Min } from "class-validator";
import { Public, RateLimit } from "../common/decorators";
import { GEOCODER, type Geocoder } from "./geocoder";

class SearchQuery {
  /** Place name, street or landmark. */
  @IsString()
  @Length(3, 120)
  q!: string;
}

class ReverseQuery {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;
}

@ApiTags("Locations")
@Controller("locations")
export class LocationsController {
  constructor(@Inject(GEOCODER) private readonly geocoder: Geocoder) {}

  @Public()
  @RateLimit(20, 60)
  @Get("search")
  async search(@Query() query: SearchQuery) {
    return { items: await this.geocoder.search(query.q.trim()) };
  }

  @Public()
  @RateLimit(20, 60)
  @Get("reverse")
  async reverse(@Query() query: ReverseQuery) {
    return { result: await this.geocoder.reverse(query.lat, query.lng) };
  }
}
